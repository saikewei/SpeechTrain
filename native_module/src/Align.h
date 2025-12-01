#pragma once

#include <vector>
#include "Phonemizer.h"  // 包含 WordAnalysis 和 PhonemeDetail 定义
#include "ModelRunner.h" // 包含模型推理和词表查询

// 评分阈值配置 (经验值，基于对数概率)
// 0.0 是满分, 负无穷是最低分
const float THRESHOLD_EXCELLENT = -1.0f; // > -1.0 优秀
const float THRESHOLD_GOOD = -2.5f;      // > -2.5 合格

/**
 * 全局函数：执行强制对齐并计算 GOP 得分
 * * @param runner: 已经执行完 runInference() 的模型运行器
 * @param words: [输入/输出] 也就是 Phonemizer::analyzeText 的结果。
 * 函数会直接修改这个 vector，填充里面的 details 和 word_score。
 * @param blank_idx: CTC Blank 的 ID (Wav2Vec2 通常是 0)
 * @return: true 表示计算成功，false 表示失败
 */
bool calculateGOP(const ModelRunner& runner, std::vector<WordAnalysis>& words, int blank_idx = 0);