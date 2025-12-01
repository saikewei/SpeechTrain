#pragma once

#include <string>
#include <vector>
#include <iostream>
#include <map>

// 单个音素的详细评分信息 (用于 UI 显示)
struct PhonemeDetail {
    std::string ipa;      // 音素符号，如 "æ"
    int token_id = -1;
    float score = 0.0f;   // GOP 分数
    bool is_good = false; // 是否合格
    int start_frame = -1; // 音频起始时间帧
    int end_frame = -1;   // 音频结束时间帧
};

// 单词分析结果
struct WordAnalysis {
    std::string word;                 // 原单词 (包含标点，用于界面显示)，如 "Hello,"
    std::string clean_word;           // 清洗后的单词 (用于发音)，如 "Hello"
    std::string raw_ipa;              // espeak 原始输出
    std::vector<std::string> phonemes;// 拆分后的音素列表 (用于 Viterbi 对齐)

    // 评分详情 (合并 Viterbi 结果后填充此项)
    std::vector<PhonemeDetail> details;
    float word_score = 0.0f;          // 单词平均分
};

class Phonemizer {
public:
    Phonemizer(const std::string& espeakDataPath, const std::map<std::string, int>& _vocab, const std::string& voiceName = "en-us");
    ~Phonemizer();

    /**
     * [核心功能] 解析句子
     * 将句子拆分为单词，并生成每个单词的音素列表
     */
    std::vector<WordAnalysis> analyzeText(const std::string& sentence);

    // 辅助工具：去除标点符号
    static std::string removePunctuation(const std::string& text);

    bool isInitialized() const { return initialized; }
    bool setVoice(const std::string& voiceName);

    // 保留旧接口用于简单测试
    std::string convertToIPA(const std::string& text);

private:
    bool initialized = false;
    const std::map<std::string, int>& vocab;

    // 内部调用 espeak API
    std::string rawEspeakCall(const std::string& text);

    // 清洗并拆分 IPA 字符串
    std::vector<std::string> cleanAndTokenizeIPA(const std::string& raw_ipa);
};