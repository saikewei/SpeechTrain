import os
import json
import base64
import websocket  # pip install websocket-client
from pydub import AudioSegment  # pip install pydub
import io

# ================= 配置区域 =================
API_KEY = (
    "sk-6KLuSeopWOnfRsZIU6wiRPrlh5Gk0swQPevvbMT6seV1aiH1"  # 替换为你的 OpenAI API Key
)
MODEL = "gpt-4o-realtime-preview-2024-10-01"
URL = f"wss://sg.uiuiapi.com/v1/realtime?model=gpt-4o-realtime-preview"
AUDIO_FILE = "D:\\temp\\common_voice_es_18306544.mp3.wav"  # 你的本地录音文件路径
PROMPT_TEXT = "请评价这个用户的英语发音，指出具体的错误和不足。"


# ================= 音频处理函数 =================
def process_audio_file(filepath):
    """
    读取音频文件，并强制转换为 OpenAI 要求的格式：
    Format: PCM 16-bit
    Sample Rate: 24kHz
    Channels: Mono (1)
    """
    print(f"正在处理音频文件: {filepath} ...")
    try:
        audio = AudioSegment.from_file(filepath)
        # 重采样为 24000Hz, 单声道, 16bit
        audio = audio.set_frame_rate(24000).set_channels(1).set_sample_width(2)

        # 获取原始 PCM 数据 (不包含 wav 头)
        raw_data = audio.raw_data

        # 转为 Base64
        base64_audio = base64.b64encode(raw_data).decode("utf-8")
        print(f"音频处理完毕，数据长度: {len(base64_audio)}")
        return base64_audio
    except Exception as e:
        print(f"音频处理出错: {e}")
        print("请确保已安装 ffmpeg 并配置了环境变量")
        return None


# ================= WebSocket 事件处理 =================
def on_open(ws):
    print(">>> 连接已建立")

    # 1. 读取并处理音频
    base64_audio = process_audio_file(AUDIO_FILE)
    if not base64_audio:
        ws.close()
        return

    # 2. 发送 Session Update (可选，用于设置系统指令或输出模态)
    # 这里我们告诉模型只需返回文本(text)，不需要返回音频，这样响应更快且省钱
    session_config = {
        "type": "session.update",
        "session": {
            "modalities": ["text"],
            "instructions": """
            你是一位专业的口语纠正教练。
            你的任务是仅基于教育目的分析用户的音频输入。
            请严格专注于分析语音（phonetics）、咬字（articulation）、语调（intonation）和重音。
            **绝对不要**分析用户的声纹特征、性别、情绪状态或个人身份信息。
            
            输出要求：
            1. 必须使用中文进行回复。
            2. 明确指出发音不标准的地方。
            3. 使用音标（IPA）辅助解释。
            4. 给出具体的改进建议。
            """,
        },
    }
    ws.send(json.dumps(session_config))

    # 3. 发送对话项 (Conversation Item)
    # 包含：用户的文本 Prompt + 用户的音频
    item_event = {
        "type": "conversation.item.create",
        "item": {
            "type": "message",
            "role": "user",
            "content": [
                {
                    "type": "input_text",
                    "text": "请听这段录音，评价我的发音准确度，并指出具体的错误。",
                },
                {"type": "input_audio", "audio": base64_audio},
            ],
        },
    }
    ws.send(json.dumps(item_event))
    print(">>> 已发送 Prompt 和 音频数据")

    # 4. 触发回复生成
    ws.send(json.dumps({"type": "response.create"}))
    print(">>> 等待模型回复...")


def on_message(ws, message):
    data = json.loads(message)

    event_type = data.get("type")

    # 错误处理
    if event_type == "error":
        print(f"\n[ERROR] Server returned error: {data['error']['message']}")
        ws.close()

    # 实时打印生成的文本
    elif event_type == "response.text.delta":
        print(data["delta"], end="", flush=True)

    # 响应结束
    elif event_type == "response.done":
        print("\n\n>>> 回复生成结束")
        ws.close()


def on_error(ws, error):
    print(f"\n[WebSocket Error] {error}")


def on_close(ws, close_status_code, close_msg):
    print("\n>>> 连接已关闭")


# ================= 主程序 =================
if __name__ == "__main__":
    if not os.path.exists(AUDIO_FILE):
        print(f"错误: 找不到文件 {AUDIO_FILE}，请先录制一个wav文件放在同级目录。")
    else:
        headers = [f"Authorization: Bearer {API_KEY}", "OpenAI-Beta: realtime=v1"]

        ws = websocket.WebSocketApp(
            URL,
            header=headers,
            on_open=on_open,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close,
        )

        ws.run_forever()
