#include <napi.h>
#include <iostream>
#include <string>
#include <vector>
#include <windows.h> // 用于路径转换

// 引入你的核心类
#include "ModelRunner.h"
#include "Phonemizer.h"
#include "Align.h"
#define DR_WAV_IMPLEMENTATION
#include "dr_wav.h"

// 辅助函数: string (UTF-8) 转 wstring (Windows Unicode)
std::wstring s2ws(const std::string &str)
{
    if (str.empty())
        return std::wstring();
    int size_needed = MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), NULL, 0);
    std::wstring wstrTo(size_needed, 0);
    MultiByteToWideChar(CP_UTF8, 0, &str[0], (int)str.size(), &wstrTo[0], size_needed);
    return wstrTo;
}

// ==========================================
// SpeechEngine 类定义
// ==========================================
class SpeechEngine : public Napi::ObjectWrap<SpeechEngine>
{
public:
    // 初始化函数：定义 JS 类结构
    static Napi::Object Init(Napi::Env env, Napi::Object exports)
    {
        Napi::Function func = DefineClass(env, "SpeechEngine", {// 定义暴露给 JS 的方法名和对应的 C++ 函数
                                                                InstanceMethod("analyze", &SpeechEngine::Analyze)});

        Napi::FunctionReference *constructor = new Napi::FunctionReference();
        *constructor = Napi::Persistent(func);
        env.SetInstanceData(constructor);

        exports.Set("SpeechEngine", func);
        return exports;
    }

    // 构造函数：对应 JS 的 new SpeechEngine(...)
    SpeechEngine(const Napi::CallbackInfo &info) : Napi::ObjectWrap<SpeechEngine>(info)
    {
        Napi::Env env = info.Env();

        if (info.Length() < 3)
        {
            Napi::TypeError::New(env, "Expected 3 arguments: modelPath, vocabPath, espeakPath").ThrowAsJavaScriptException();
            return;
        }

        std::string modelPath = info[0].As<Napi::String>();
        std::string vocabPath = info[1].As<Napi::String>();
        std::string espeakPath = info[2].As<Napi::String>();

        try
        {
            // 1. 初始化 ASR
            engine_ = new ModelRunner();
            engine_->loadModel(s2ws(modelPath));
            if (!engine_->loadVocab(vocabPath))
            {
                throw std::runtime_error("Failed to load vocab");
            }

            // 2. 初始化 G2P
            phonemizer_ = new Phonemizer(espeakPath, engine_->getVocab(), "en-us");
            if (!phonemizer_->isInitialized())
            {
                throw std::runtime_error("Failed to initialize Espeak");
            }
        }
        catch (const std::exception &e)
        {
            Napi::Error::New(env, e.what()).ThrowAsJavaScriptException();
        }
    }

    // 析构函数：JS 对象被回收时调用，释放 C++ 内存
    ~SpeechEngine()
    {
        if (engine_)
        {
            delete engine_;
            engine_ = nullptr;
        }
        if (phonemizer_)
        {
            delete phonemizer_;
            phonemizer_ = nullptr;
        }
    }

private:
    ModelRunner *engine_ = nullptr;
    Phonemizer *phonemizer_ = nullptr;

    // 核心分析方法
    Napi::Value Analyze(const Napi::CallbackInfo &info)
    {
        Napi::Env env = info.Env();

        // 基本参数检查
        if (info.Length() < 2)
        {
            Napi::TypeError::New(env, "Expected at least 2 arguments").ThrowAsJavaScriptException();
            return env.Null();
        }

        std::string text;

        // =======================================================
        // 分支 1: 传入的是 Float32Array (直接内存传递)
        // 签名: analyze(float32Array, sampleRate, channels, text)
        // =======================================================
        if (info[0].IsTypedArray())
        {
            // 检查参数数量
            if (info.Length() < 4)
            {
                Napi::TypeError::New(env, "Raw mode expects: (data, sampleRate, channels, text)").ThrowAsJavaScriptException();
                return env.Null();
            }

            Napi::Float32Array pcmData = info[0].As<Napi::Float32Array>();
            int sampleRate = info[1].As<Napi::Number>().Int32Value();
            int channels = info[2].As<Napi::Number>().Int32Value();
            text = info[3].As<Napi::String>();

            // 直接加载内存数据！
            // pcmData.Data() 返回 float* 指针
            // pcmData.ElementLength() 返回元素个数
            engine_->loadAudio(pcmData.Data(), pcmData.ElementLength(), sampleRate, channels);
        }
        // =======================================================
        // 分支 2: 传入的是 String (文件路径模式)
        // 签名: analyze(wavPath, text)
        // =======================================================
        else if (info[0].IsString())
        {
            std::string wavPath = info[0].As<Napi::String>();
            text = info[1].As<Napi::String>();

            unsigned int c, r;
            drwav_uint64 tf;
            // 使用 dr_wav 读取文件
            float *pData = drwav_open_file_and_read_pcm_frames_f32(wavPath.c_str(), &c, &r, &tf, NULL);

            if (!pData)
            {
                Napi::Error::New(env, "Failed to open WAV file").ThrowAsJavaScriptException();
                return env.Null();
            }

            engine_->loadAudio(pData, tf, r, c);
            drwav_free(pData, NULL);
        }
        else
        {
            Napi::TypeError::New(env, "First argument must be path (String) or PCM data (Float32Array)").ThrowAsJavaScriptException();
            return env.Null();
        }

        // 2. 推理
        if (!engine_->runInference())
        {
            Napi::Error::New(env, "Inference execution failed").ThrowAsJavaScriptException();
            return env.Null();
        }

        // 3. 文本转音素
        std::vector<WordAnalysis> ws = phonemizer_->analyzeText(text);

        // 4. 强制对齐算分
        if (!calculateGOP(*engine_, ws, 0))
        {
            Napi::Error::New(env, "Alignment failed").ThrowAsJavaScriptException();
            return env.Null();
        }

        // 5. 构造 JS 返回对象 (代码与之前一致，省略部分重复代码以节省篇幅)
        Napi::Object resultObj = Napi::Object::New(env);
        Napi::Array wordsArr = Napi::Array::New(env, ws.size());
        float total_score_sum = 0.0f;
        int valid_word_count = 0;

        for (size_t i = 0; i < ws.size(); ++i)
        {
            const auto &w = ws[i];
            Napi::Object wObj = Napi::Object::New(env);
            wObj.Set("word", w.word);
            wObj.Set("score", w.word_score);

            if (w.word_score > -10.0f)
            {
                total_score_sum += w.word_score;
                valid_word_count++;
            }

            Napi::Array pArr = Napi::Array::New(env, w.details.size());
            for (size_t j = 0; j < w.details.size(); ++j)
            {
                const auto &d = w.details[j];
                Napi::Object dObj = Napi::Object::New(env);
                dObj.Set("ipa", d.ipa);
                dObj.Set("score", d.score);
                dObj.Set("is_good", d.is_good);
                dObj.Set("start_frame", d.start_frame);
                dObj.Set("end_frame", d.end_frame);
                pArr[j] = dObj;
            }
            wObj.Set("phonemes", pArr);
            wordsArr[i] = wObj;
        }

        float overall = (valid_word_count > 0) ? (total_score_sum / valid_word_count) : -10.0f;
        resultObj.Set("words", wordsArr);
        resultObj.Set("overall_score", overall);

        return resultObj;
    }
};

// 模块注册入口
Napi::Object Init(Napi::Env env, Napi::Object exports)
{
    return SpeechEngine::Init(env, exports);
}

NODE_API_MODULE(speech_node, Init)