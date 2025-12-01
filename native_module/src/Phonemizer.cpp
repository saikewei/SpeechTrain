#include "Phonemizer.h"
#include <speak_lib.h>
#include <cstring>
#include <sstream>
#include <algorithm>
#include <cctype>

Phonemizer::Phonemizer(const std::string& espeakDataPath, const std::map<std::string, int>& _vocab, const std::string& voiceName) : initialized(false), vocab(_vocab) {
    // 1. 初始化 espeak
    // AUDIO_OUTPUT_RETRIEVAL: 我们不需要播放声音，只需要获取音素
    // 传入 espeak-ng-data 的父目录路径
    int sampleRate = espeak_Initialize(AUDIO_OUTPUT_RETRIEVAL, 0, espeakDataPath.c_str(), 0);

    if (sampleRate == -1) {
        std::cerr << "[Phonemizer Error] Failed to initialize espeak-ng. "
            << "Check if 'espeak-ng-data' exists in: " << espeakDataPath << std::endl;
        initialized = false;
        return;
    }

    // 2. 设置语音
    if (espeak_SetVoiceByName(voiceName.c_str()) != EE_OK) {
        std::cerr << "[Phonemizer Error] Failed to set voice: " << voiceName << std::endl;
        initialized = false;
        return;
    }

    initialized = true;
    std::cout << "[Phonemizer] Initialized successfully. Voice: " << voiceName << std::endl;
}

Phonemizer::~Phonemizer() {
    if (initialized) {
        espeak_Terminate();
        std::cout << "[Phonemizer] Terminated." << std::endl;
    }
}

// 标点符号去除函数
std::string Phonemizer::removePunctuation(const std::string& text) {
    std::string result = text;
    // 使用 std::remove_if 和 lambda 表达式移除所有标点
    // 注意：这会把 "it's" 变成 "its"，这对 espeak 来说通常是可以接受的
    // 如果需要保留单引号，可以在 lambda 里加条件
    result.erase(std::remove_if(result.begin(), result.end(), [](unsigned char c) {
        return std::ispunct(c);
        }), result.end());
    return result;
}

bool Phonemizer::setVoice(const std::string &voiceName)
{
    if (!initialized) return false;

    if (espeak_SetVoiceByName(voiceName.c_str()) != EE_OK) {
        std::cerr << "[Phonemizer Error] Failed to set voice: " << voiceName << std::endl;
        return false;
    }

    std::cout << "[Phonemizer] Voice changed to: " << voiceName << std::endl;
    return true;
}

std::string Phonemizer::rawEspeakCall(const std::string& text) {
    if (!initialized) return "";

    std::string result = "";
    const void* text_ptr = text.c_str();

    while (text_ptr != NULL) {
        // espeakCHARS_AUTO: 自动检测字符编码
        // espeakPHONEMES_IPA: 获取 IPA 音标
        const char* phonemes = espeak_TextToPhonemes((const void**)&text_ptr, espeakCHARS_AUTO, espeakPHONEMES_IPA);

        if (phonemes != NULL) {
            std::string p_str = phonemes;
            // 去掉 espeak 可能在末尾添加的换行符
            if (!p_str.empty() && p_str.back() == '\n') {
                p_str.pop_back();
            }
            result += p_str;
        }

        if (text_ptr != NULL && *((char*)text_ptr) == '\0') {
            break;
        }
    }
    return result;
}

std::string Phonemizer::convertToIPA(const std::string& text) {
    return rawEspeakCall(text);
}

// 辅助函数：判断是否是重音符或空格 (需要清洗掉的字符)
static bool isIgnoredChar(const std::string& s) {
    return (s == "ˈ" || s == "ˌ" || s == " " || s == "_" || s == "\u00A0");
}

// 清洗并拆分 IPA 字符串 (处理 UTF-8 字符)
std::vector<std::string> Phonemizer::cleanAndTokenizeIPA(const std::string& raw_ipa) {
    std::string clean_str = "";

    // --- 第一步：预清洗 (Pre-cleaning) ---
    // 去掉重音符号、空格，保留所有可能的音素字符(包括长音符、连字符等)
    // 这样后续匹配就不用处理干扰项了
    for (size_t i = 0; i < raw_ipa.length(); ) {
        unsigned char c = raw_ipa[i];
        size_t char_len = 0;
        if ((c & 0x80) == 0) char_len = 1;
        else if ((c & 0xE0) == 0xC0) char_len = 2;
        else if ((c & 0xF0) == 0xE0) char_len = 3;
        else if ((c & 0xF8) == 0xF0) char_len = 4;
        else char_len = 1;

        if (i + char_len > raw_ipa.length()) break;
        std::string symbol = raw_ipa.substr(i, char_len);

        if (!isIgnoredChar(symbol)) {
            clean_str += symbol;
        }
        i += char_len;
    }

    // --- 第二步：最大正向匹配 (MaxMatch Tokenization) ---
    std::vector<std::string> tokens;
    size_t i = 0;

    while (i < clean_str.length()) {
        bool match_found = false;

        // 尝试匹配长度，从长到短 (假设最长的音素不会超过 4 个 UTF-8 字符，如 tʃʰ)
        // 注意：这里的 length 是 std::string 的字节长度，不是字符数。
        // 一个中文/特殊符号通常是 2-3 字节。为了保险，我们尝试匹配多一点字节。
        // "eɪ" 可能是 2-4 个字节，"tʃ" 可能是 2-4 个字节。
        // 我们从 8 个字节开始往下试 (足够覆盖 3-4 个 unicode 字符)

        size_t max_try_len = 8;
        if (i + max_try_len > clean_str.length()) {
            max_try_len = clean_str.length() - i;
        }

        for (size_t len = max_try_len; len >= 1; --len) {
            std::string sub = clean_str.substr(i, len);

            // 查表：如果这个子串在词表里
            if (vocab.find(sub) != vocab.end()) {
                tokens.push_back(sub);
                i += len; // 指针前进
                match_found = true;
                break; // 找到最长的了，跳出内层循环，继续找下一个
            }
        }

        if (!match_found) {
            // 遇到词表里没有的字符 (Unknown)
            // 策略：跳过这 1 个字节，或者把这个字符当未知处理
            // 这里我们选择跳过并打印警告 (或者你可以把它作为一个单独的未知token加进去)
            // 既然没匹配上，我们至少要向前移动 1 个 utf-8 字符，防止死循环

            unsigned char c = clean_str[i];
            size_t char_len = 1;
            if ((c & 0xE0) == 0xC0) char_len = 2;
            else if ((c & 0xF0) == 0xE0) char_len = 3;
            else if ((c & 0xF8) == 0xF0) char_len = 4;

            std::cerr << "Unknown token char: " << clean_str.substr(i, char_len) << std::endl;
            i += char_len;
        }
    }

	for (int k = 0; k < tokens.size(); ++k) {
		 //std::cout << "Token " << k << ": " << tokens[k] << std::endl;    
	}

    return tokens;
}

// [核心] 句子分析：分词 -> 去标点 -> 转音素 -> 结构化存储
std::vector<WordAnalysis> Phonemizer::analyzeText(const std::string& sentence) {
    std::vector<WordAnalysis> results;
    std::stringstream ss(sentence);
    std::string word;

    // 1. 按空格分词 (简单的 Tokenization)
    while (ss >> word) {
        WordAnalysis wa;
        wa.word = word;

        std::string clean_word = word;
        clean_word.erase(std::remove_if(clean_word.begin(), clean_word.end(), ::ispunct), clean_word.end());

        wa.raw_ipa = rawEspeakCall(clean_word);

        // [修改] 调用新的分词逻辑，传入 vocab
        wa.phonemes = cleanAndTokenizeIPA(wa.raw_ipa);

        results.push_back(wa);
    }

    return results;
}