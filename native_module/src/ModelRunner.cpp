#include "ModelRunner.h"

#include <cmath>
#include <numeric>
#include <iostream>
#include <json.hpp>
#include <fstream>

using json = nlohmann::json;

ModelRunner::ModelRunner() : session(nullptr)
{
	audio.clear();
	session_options = new Ort::SessionOptions;
	session_options->SetIntraOpNumThreads(1);

	env = new Ort::Env(ORT_LOGGING_LEVEL_WARNING, "SpeechEngine");
}

ModelRunner::~ModelRunner()
{
	delete session_options;
	delete env;

	if (session) {
		delete session;
	}
}

void ModelRunner::loadAudio(const float* input, size_t input_size, unsigned int src_rate, unsigned int channels)
{
	audio.assign(input, input + input_size);

	mixToMono(channels, input_size);
	resampleAudio(src_rate);
	normalizeAudio();

	std::cout << "[Info] Audio Loaded. Final Input Size: " << audio.size() << " samples." << std::endl;
}

bool ModelRunner::loadModel(const std::wstring& model_path)
{
	if (session) {
		std::cout << "[Info] Unloading Previous Model." << std::endl;
		delete session;
		session = nullptr;
	}

    try {
        session = new Ort::Session(*env, model_path.c_str(), *session_options);
        std::cout << "[Info] Model Loaded from: " << std::string(model_path.begin(), model_path.end()) << std::endl;

        return true;
    } catch (const Ort::Exception& e) {
        std::cerr << "[Error] Failed to load model: " << e.what() << std::endl;
        return false;
	}
}

void ModelRunner::mixToMono(unsigned int channels, size_t total_frames)
{
	if (channels == 1) {
		// Already mono
		return;
	}

	for (size_t i = 0; i < total_frames; ++i) {
		float sum = 0.0f;
		for (unsigned int c = 0; c < channels; ++c) {
			sum += audio[i * channels + c];
		}
		audio[i] = sum / channels;
	}

	audio.erase(audio.begin() + total_frames, audio.end());
}

void ModelRunner::resampleAudio(unsigned int src_rate)
{
	if (src_rate == TARGET_SAMPLE_RATE) {
		// No resampling needed
		return;
	}

	// 计算目标长度
	double ratio = (double)src_rate / TARGET_SAMPLE_RATE;
	size_t output_size = (size_t)(audio.size() / ratio);

	std::vector<float> resampled(output_size);
	for (size_t i = 0; i < output_size; ++i) {
		double src_index = i * ratio;
		size_t idx = (size_t)std::floor(src_index);
		float frac = (float)(src_index - idx);
		if (idx + 1 < audio.size()) {
			// Linear interpolation
			resampled[i] = audio[idx] * (1.0f - frac) + audio[idx + 1] * frac;
		}
		else {
			resampled[i] = audio[idx];
		}
	}

	audio = std::move(resampled);
}

void ModelRunner::normalizeAudio()
{
	if (audio.empty()) return;

	// 1. 计算均值
	double sum = std::accumulate(audio.begin(), audio.end(), 0.0);
	double mean = sum / audio.size();

	// 2. 计算方差
	double sq_sum = 0.0;
	for (float val : audio) {
		sq_sum += (val - mean) * (val - mean);
	}
	double std_dev = std::sqrt(sq_sum / audio.size());

	// 防止除以 0
	if (std_dev < 1e-5) std_dev = 1e-5;

	// 3. 应用归一化
	for (float& val : audio) {
		val = (float)((val - mean) / std_dev);
	}
}

bool ModelRunner::loadVocab(const std::string& json_path)
{
    std::ifstream f(json_path);
    if (!f.is_open()) {
        std::cerr << "[Error] Cannot open vocab file: " << json_path << std::endl;
        return false;
    }

    try {
        json j = json::parse(f);
        token_to_id.clear();
        id_to_token.clear();

        for (auto& element : j.items()) {
            std::string token = element.key();
            int id = element.value();

            token_to_id[token] = id;
            id_to_token[id] = token;
        }
        std::cout << "[Info] Vocab Loaded. Total tokens: " << token_to_id.size() << std::endl;
        return true;
    }
    catch (json::parse_error& e) {
        std::cerr << "[Error] JSON parse error: " << e.what() << std::endl;
        return false;
    }
}

bool ModelRunner::runInference()
{
    if (!session) {
        std::cerr << "[Error] Model not loaded!" << std::endl;
        return false;
    }
    if (audio.empty()) {
        std::cerr << "[Error] Audio not loaded!" << std::endl;
        return false;
    }

    try {
        // 1. 准备 Input Tensor
        // Input shape: [1, Time]
        std::vector<int64_t> input_shape = { 1, (int64_t)audio.size() };

        Ort::MemoryInfo memory_info = Ort::MemoryInfo::CreateCpu(OrtArenaAllocator, OrtMemTypeDefault);

        // 使用 audio 向量的数据直接创建 Tensor (Zero-copy)
        Ort::Value input_tensor = Ort::Value::CreateTensor<float>(
            memory_info, audio.data(), audio.size(), input_shape.data(), input_shape.size()
        );

        // 2. 运行推理
        const char* input_names[] = { "input_values" }; // 必须和你导出 ONNX 时的名字一致
        const char* output_names[] = { "logits" };

        auto output_tensors = session->Run(
            Ort::RunOptions{ nullptr },
            input_names, &input_tensor, 1,
            output_names, 1
        );

        // 3. 获取输出维度
        // Output shape: [1, TimeSteps, VocabSize]
        auto type_info = output_tensors[0].GetTensorTypeAndShapeInfo();
        auto dims = type_info.GetShape();

        // dims[0] 是 batch (1)
        this->time_steps = (int)dims[1];
        this->vocab_size = (int)dims[2];

        // 4. 提取数据
        // GetTensorMutableData 返回的是扁平化的 float 指针
        const float* raw_logits = output_tensors[0].GetTensorData<float>();

        // 将 raw logits 复制到我们的成员变量中
        // 总大小 = time_steps * vocab_size
        output_log_probs.assign(raw_logits, raw_logits + (time_steps * vocab_size));

        // 5. [关键] 执行 Log-Softmax
        // 原始模型输出的是 logits，我们需要对数概率来进行 Viterbi 计算
        computeLogSoftmax();

        std::cout << "[Info] Inference Done. Matrix Shape: [" << time_steps << " x " << vocab_size << "]" << std::endl;
        return true;
    }
    catch (const Ort::Exception& e) {
        std::cerr << "[ONNX Error] " << e.what() << std::endl;
        return false;
    }
}

// LogSoftmax (数值稳定版)
// LogSoftmax(x_i) = x_i - log(sum(exp(x_j)))
// 为了防止 exp 溢出，使用 trick: log(sum(exp(x_j))) = max + log(sum(exp(x_j - max)))
void ModelRunner::computeLogSoftmax()
{
    // 对每一帧 (Time Step) 独立进行 Softmax
    for (int t = 0; t < time_steps; ++t) {

        // 指向当前帧的起始位置
        float* frame_data = &output_log_probs[t * vocab_size];

        // A. 找最大值 (Max)
        float max_val = -std::numeric_limits<float>::infinity();
        for (int v = 0; v < vocab_size; ++v) {
            if (frame_data[v] > max_val) max_val = frame_data[v];
        }

        // B. 计算 Sum Exp (分母)
        float sum_exp = 0.0f;
        for (int v = 0; v < vocab_size; ++v) {
            sum_exp += std::exp(frame_data[v] - max_val);
        }

        // C. 计算 Log Sum
        float log_sum_exp = std::log(sum_exp); // 这里的 log 其实是以 e 为底的 ln

        // D. 更新为 Log Probability
        for (int v = 0; v < vocab_size; ++v) {
            // log(e^x / sum) = x - (max + log(sum_e_shifted))
            frame_data[v] = (frame_data[v] - max_val) - log_sum_exp;
        }
    }
}

// 辅助 Getter
float ModelRunner::getLogProb(int time_step, int token_id) const
{
    if (time_step < 0 || time_step >= time_steps || token_id < 0 || token_id >= vocab_size) {
        // 越界返回极小的概率 (log(0) = -inf)
        return -1e9f;
    }
    return output_log_probs[time_step * vocab_size + token_id];
}

int ModelRunner::getTokenId(const std::string& token) const
{
    auto it = token_to_id.find(token);
    if (it != token_to_id.end()) {
        return it->second;
    }
    return -1; // Not found
}

std::string ModelRunner::getTokenString(int id) const
{
    auto it = id_to_token.find(id);
    if (it != id_to_token.end()) {
        return it->second;
    }
    return "<unk>";
}
