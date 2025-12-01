{
    "targets": [
        {
            "target_name": "speech_core",
            "cflags!": ["-fno-exceptions"],
            "cflags_cc!": ["-fno-exceptions"],
            "sources": [
                "src/api.cpp",
                "src/ModelRunner.cpp",
                "src/Phonemizer.cpp",
                "src/Align.cpp",
            ],
            "include_dirs": [
                "<!@(node -p \"require('node-addon-api').include\")",
                "libs/onnxruntime/include",
                "libs/espeak-ng/include",
                "libs/dr_libs",
                "libs/json",
            ],
            "defines": ["NAPI_CPP_EXCEPTIONS"],
            "conditions": [
                [
                    'OS=="win"',
                    {
                        "libraries": [
                            "-l<(module_root_dir)/libs/onnxruntime/lib/onnxruntime.lib",
                            "-l<(module_root_dir)/libs/espeak-ng/lib/libespeak-ng.lib",
                        ],
                        "msvs_settings": {"VCCLCompilerTool": {"ExceptionHandling": 1}},
                    },
                ]
            ],
        }
    ]
}
