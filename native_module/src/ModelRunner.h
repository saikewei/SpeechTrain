#pragma once
#include <string>
#include <vector>
#include <onnxruntime_cxx_api.h>
#include <map>

const unsigned int TARGET_SAMPLE_RATE = 16000;

class ModelRunner {
public:
	ModelRunner();
	~ModelRunner();
	void loadAudio(const float* input, size_t input_size, unsigned int src_rate, unsigned int channels);
	bool loadModel(const std::wstring& model_path);
    // 加载 Vocab.json
    bool loadVocab(const std::string& json_path);

    // 运行推理
    // 返回 true 表示成功
    bool runInference();

    // 获取推理结果的接口 (给 Viterbi 算法用)
    // 获取时间步数 (Frames)
    int getTimeSteps() const { return time_steps; }
    // 获取词表大小 (Vocab Size)
    int getVocabSize() const { return vocab_size; }
    // 获取某一帧、某一个Token的对数概率 (Log Probability)
    float getLogProb(int time_step, int token_id) const;
    // 根据 Token 字符串获取 ID (例如 "a" -> 7)
    int getTokenId(const std::string& token) const;
    // 根据 ID 获取 Token 字符串 (调试用)
    std::string getTokenString(int id) const;
    // 获取完整词表的常量引用 (给 Phonemizer 分词用)
    const std::map<std::string, int>& getVocab() const { return token_to_id; }

private:
	std::vector<float> audio;

	Ort::SessionOptions* session_options;
	Ort::Env* env;
	Ort::Session* session;

	void mixToMono(unsigned int channels, size_t total_frames);
	void resampleAudio(unsigned int src_rate);
	void normalizeAudio();
    void computeLogSoftmax();

    std::map<std::string, int> token_to_id;
    std::map<int, std::string> id_to_token;

    std::vector<float> output_log_probs;
    int time_steps = 0;
    int vocab_size = 0;
};
