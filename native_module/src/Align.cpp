#include "Align.h"
#include <iostream>
#include <algorithm>
#include <limits>
#include <cmath>

// 定义负无穷
const float NEG_INF = -1e9f;

// 内部使用的结构体，用于记录扁平化后的映射关系
struct TargetMap {
    int word_idx;       // 属于第几个单词
    int phoneme_idx;    // 属于单词里的第几个音素
    int token_id;       // 模型对应的 ID
    std::string text;   // 音素文本
};

bool calculateGOP(const ModelRunner& runner, std::vector<WordAnalysis>& words, int blank_idx) {
    if (words.empty()) return false;

    // ==========================================
    // 第一步：扁平化目标序列 (Flattening)
    // ==========================================
    // Viterbi 需要一个连续的 ID 列表，但我们的输入是分词的结构。
    // 我们需要建立一个映射：FlatIndex -> (WordIndex, PhonemeIndex)
    std::vector<TargetMap> flat_targets;

    for (size_t w_i = 0; w_i < words.size(); ++w_i) {
        // 先清空之前的评分详情
        words[w_i].details.clear();
        words[w_i].word_score = 0.0f;

        const auto& phoneme_list = words[w_i].phonemes;
        for (size_t p_i = 0; p_i < phoneme_list.size(); ++p_i) {
            std::string p_text = phoneme_list[p_i];
            int tid = runner.getTokenId(p_text);

            if (tid != -1) {
                flat_targets.push_back({ (int)w_i, (int)p_i, tid, p_text });
            }
            else {
                // 如果模型词表里没有这个音素 (容错处理)
                // 比如 espeak 输出了一些罕见符号，这里选择跳过或报错
                std::cerr << "[Warning] Skipping unknown phoneme: " << p_text << " in word: " << words[w_i].word << std::endl;
            }
        }
    }

    if (flat_targets.empty()) {
        std::cerr << "[Error] No valid targets found for alignment." << std::endl;
        return false;
    }

    // ==========================================
    // 第二步：构建 CTC 扩展图
    // ==========================================
    // 目标: [A, B] -> 状态: [b, A, b, B, b]
    std::vector<int> extended_states;
    extended_states.reserve(flat_targets.size() * 2 + 1);

    for (const auto& t : flat_targets) {
        extended_states.push_back(blank_idx);
        extended_states.push_back(t.token_id);
    }
    extended_states.push_back(blank_idx);

    int T = runner.getTimeSteps();
    int S = (int)extended_states.size();

    // DP 表: dp[t * S + s]
    std::vector<float> dp(T * S, NEG_INF);
    // 回溯表: backtrack[t * S + s] = prev_state_index
    std::vector<int> backtrack(T * S, -1);

    // ==========================================
    // 第三步：Viterbi 前向算法 (Forward)
    // ==========================================

    // 初始化 t=0
    float prob0 = runner.getLogProb(0, extended_states[0]);
    dp[0] = prob0;
    if (S > 1) {
        float prob1 = runner.getLogProb(0, extended_states[1]);
        dp[1] = prob1;
    }

    for (int t = 1; t < T; ++t) {
        for (int s = 0; s < S; ++s) {
            int current_token = extended_states[s];
            float current_prob = runner.getLogProb(t, current_token);

            float max_score = NEG_INF;
            int best_prev = -1;

            // 1. Stay (s -> s)
            if (dp[(t - 1) * S + s] > NEG_INF) {
                if (dp[(t - 1) * S + s] > max_score) {
                    max_score = dp[(t - 1) * S + s];
                    best_prev = s;
                }
            }

            // 2. Transition (s-1 -> s)
            if (s > 0 && dp[(t - 1) * S + (s - 1)] > NEG_INF) {
                if (dp[(t - 1) * S + (s - 1)] > max_score) {
                    max_score = dp[(t - 1) * S + (s - 1)];
                    best_prev = s - 1;
                }
            }

            // 3. Skip Blank (s-2 -> s)
            // 条件：当前不是Blank，中间是Blank，且当前音素 != 上一个实音素
            if (s > 1 && current_token != blank_idx) {
                if (extended_states[s - 1] == blank_idx) {
                    if (extended_states[s - 2] != current_token) {
                        if (dp[(t - 1) * S + (s - 2)] > NEG_INF) {
                            if (dp[(t - 1) * S + (s - 2)] > max_score) {
                                max_score = dp[(t - 1) * S + (s - 2)];
                                best_prev = s - 2;
                            }
                        }
                    }
                }
            }

            if (best_prev != -1) {
                dp[t * S + s] = max_score + current_prob;
                backtrack[t * S + s] = best_prev;
            }
        }
    }

    // ==========================================
    // 第四步：回溯最佳路径 (Backtracking)
    // ==========================================

    // 寻找终点：最后必须停在 最后一个Blank 或 最后一个音素
    int current_s = -1;
    float score_blank = dp[(T - 1) * S + (S - 1)];
    float score_last = (S > 1) ? dp[(T - 1) * S + (S - 2)] : NEG_INF;

    if (score_blank > score_last) current_s = S - 1;
    else current_s = S - 2;

    // 检查是否对齐失败
    if (current_s < 0 || dp[(T - 1) * S + current_s] <= NEG_INF) {
        std::cerr << "[Error] Alignment broken. Audio might not match text." << std::endl;
        return false;
    }

    // path_states[t] 存储的是 t 时刻对应的扩展状态索引 s
    std::vector<int> path_states(T);
    for (int t = T - 1; t >= 0; --t) {
        path_states[t] = current_s;
        current_s = backtrack[t * S + current_s];
    }

    // ==========================================
    // 第五步：计算 GOP 并回填结果
    // ==========================================

    // 我们需要按 flat_targets 的顺序，从 path_states 里提取每一段的平均概率
    for (size_t i = 0; i < flat_targets.size(); ++i) {
        const auto& target = flat_targets[i];

        // 扩展状态索引：target[i] 对应的是 state[2*i + 1]
        // state[0]=blank, state[1]=target[0], state[2]=blank, state[3]=target[1]...
        int target_state_s = (int)i * 2 + 1;

        int start_t = -1;
        int end_t = -1;
        float sum_log_prob = 0.0f;
        int count = 0;

        // 在路径中寻找该状态的时间跨度
        for (int t = 0; t < T; ++t) {
            if (path_states[t] == target_state_s) {
                if (start_t == -1) start_t = t;
                end_t = t;
                sum_log_prob += runner.getLogProb(t, target.token_id);
                count++;
            }
        }

        // 创建详情对象
        PhonemeDetail detail;
        detail.ipa = target.text;
        detail.token_id = target.token_id;
        detail.start_frame = start_t;
        detail.end_frame = end_t;

        if (count > 0) {
            detail.score = sum_log_prob / count;
        }
        else {
            // 极少见情况：该音素被跳过（duration=0）
            detail.score = -10.0f;
        }

        // 判定好坏
        detail.is_good = (detail.score > THRESHOLD_GOOD);

        // 回填到对应的 WordAnalysis 结构中
        // 使用 target.word_idx 知道它是哪个词
        words[target.word_idx].details.push_back(detail);
    }

    // ==========================================
    // 第六步：计算单词平均分
    // ==========================================
    for (auto& w : words) {
        if (w.details.empty()) {
            w.word_score = -10.0f;
            continue;
        }

        float total = 0.0f;
        int valid = 0;
        for (const auto& d : w.details) {
            // 过滤掉极低分（可能是未检测到）避免拉低平均分太多
            if (d.score > -9.0f) {
                total += d.score;
                valid++;
            }
        }

        if (valid > 0) w.word_score = total / valid;
        else w.word_score = -10.0f;
    }

    return true;
}