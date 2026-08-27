<template>
    <div>
                                        <div class="flex items-center justify-between mb-4">
                                            <div>
                                                <div class="text-sm font-bold text-gray-700">启用语音朗读</div>
                                                <div class="text-[10px] text-gray-400 mt-0.5">使用语音引擎朗读角色回复，本地运行，无需联网与密钥。</div>
                                            </div>
                                            <label class="relative inline-flex items-center cursor-pointer">
                                                <input type="checkbox" v-model="settings.ttsEnabled" class="settings-toggle-input sr-only">
                                                <div class="settings-toggle settings-toggle--indigo"></div>
                                            </label>
                                        </div>
    
                                        <div v-if="settings.ttsEnabled" class="space-y-4 animate-fade-in">
                                            <!-- 语音引擎：选择朗读服务 -->
                                            <div>
                                                <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">语音引擎</label>
                                                <div class="grid grid-cols-2 gap-2">
                                                    <button type="button" @click="selectTtsService('system')"
                                                        :class="['p-3 rounded-xl border-2 text-left transition-all', settings.ttsService === 'system' ? 'border-teal-400 bg-teal-50/60' : 'border-gray-100 hover:border-gray-200']">
                                                        <div class="text-sm font-bold" :class="settings.ttsService === 'system' ? 'text-teal-700' : 'text-gray-700'">系统语音</div>
                                                        <div class="text-[10px] text-gray-400 mt-0.5">Android 系统引擎，无需下载</div>
                                                    </button>
                                                    <button type="button" @click="selectTtsService('local')"
                                                        :class="['p-3 rounded-xl border-2 text-left transition-all', settings.ttsService === 'local' ? 'border-teal-400 bg-teal-50/60' : 'border-gray-100']">
                                                        <div class="text-sm font-bold text-gray-700">本地模型</div>
                                                        <div class="text-[10px] text-gray-400 mt-0.5">On-device neural TTS, voices download on demand</div>
                                                    </button>
                                                </div>
                                            </div>
    
                                            <!-- 引擎设置：所选引擎的专属选项 -->
                                            <div>
                                                <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">引擎设置</label>
                                                <div v-if="settings.ttsService === 'system'" class="bg-gray-50/60 p-3 rounded-xl border border-gray-100">
                                                    <div class="flex items-center justify-between">
                                                        <span class="text-xs font-medium text-gray-500">引擎状态</span>
                                                        <span class="text-xs font-bold" :class="ttsStatus.available ? 'text-emerald-600' : 'text-red-500'">{{ ttsStatusLabel }}</span>
                                                    </div>
                                                </div>
                                                <div v-else class="bg-gray-50/60 p-3 rounded-xl border border-gray-100 space-y-3">
                                                    <div class="flex items-center justify-between">
                                                        <span class="text-xs font-medium text-gray-500">Engine status</span>
                                                        <span class="text-xs font-bold" :class="ttsStatus.available ? 'text-emerald-600' : 'text-red-500'">{{ ttsStatusLabel }}</span>
                                                    </div>
                                                    <div v-if="!localTtsStatus.checked" class="text-xs text-gray-400">Checking local engine...</div>
                                                    <div v-else-if="!localTtsStatus.available" class="text-xs text-gray-500">Local neural TTS is only available in the Android app.</div>
                                                    <div v-else>
                                                        <div v-for="voice in localTtsVoices" :key="voice.id"
                                                            class="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-gray-100 bg-white/80">
                                                            <div class="min-w-0">
                                                                <div class="text-xs font-bold text-gray-700 truncate">
                                                                    {{ voice.name }}
                                                                    <span class="font-mono text-[10px] font-normal text-gray-400 ml-1">~{{ voice.sizeMb }}MB</span>
                                                                </div>
                                                                <div class="text-[10px] text-gray-400 truncate">{{ voice.desc }}</div>
                                                            </div>
                                                            <div class="flex items-center gap-1.5 flex-shrink-0">
                                                                <span v-if="voice.installed" class="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded">Installed</span>
                                                                <button v-if="voice.installed" type="button" @click="removeLocalTtsVoice(voice.id)"
                                                                    class="px-2 py-1 text-[10px] font-bold text-red-500 bg-red-50 border border-red-100 hover:bg-red-100 rounded-lg transition-all active:scale-95">Clear</button>
                                                                <button v-else-if="localTtsInstall && localTtsInstall.voiceId === voice.id" type="button" @click="cancelLocalTtsInstall"
                                                                    class="px-2 py-1 text-[10px] font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg transition-all active:scale-95">Cancel</button>
                                                                <button v-else type="button" :disabled="!!localTtsInstall" @click="installLocalTtsVoice(voice.id)"
                                    class="px-2 py-1 text-[10px] font-bold text-white bg-teal-500 hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all active:scale-95">Install</button>
                                                            </div>
                                                        </div>
                                                        <div v-if="localTtsInstall" class="space-y-1">
                                                            <div class="flex items-center justify-between text-[10px] text-gray-500">
                                                                <span class="font-bold">{{ localTtsInstall.phase === 'extract' ? 'Extracting...' : 'Downloading...' }}</span>
                                                                <span class="font-mono">{{ localTtsInstallPercent }}%</span>
                                                            </div>
                                                            <div class="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                                <div class="h-full bg-teal-500 transition-all" :style="{ width: localTtsInstallPercent + '%' }"></div>
                                                            </div>
                                                        </div>
                                                        <div v-if="localTtsVoiceOptions.length" class="flex items-center justify-between gap-2">
                                                            <span class="text-xs font-medium text-gray-500 flex-shrink-0">Default voice</span>
                                                            <select v-model="settings.ttsLocalVoice"
                                                                class="flex-1 max-w-[60%] bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300">
                                                                <option value="">Auto (first installed)</option>
                                                                <option v-for="voice in localTtsVoiceOptions" :key="voice.id" :value="voice.id">{{ voice.name }}</option>
                                                            </select>
                                                        </div>
                                                        <div v-if="localTtsSelectedVoiceIsClone" class="space-y-2 p-3 rounded-lg border border-purple-100 bg-purple-50/40">
                                                            <div class="flex items-center justify-between">
                                                                <span class="text-xs font-bold text-purple-700">Clone voice reference</span>
                                                                <button v-if="settings.ttsCloneReferenceUri" type="button" @click="removeVoiceClip"
                                                                    class="px-2 py-1 text-[10px] font-bold text-purple-500 bg-purple-50 border border-purple-100 hover:bg-purple-100 rounded-lg transition-all active:scale-95">Remove</button>
                                                            </div>
                                                            <input type="file" accept="audio/*" @change="handleVoiceClipUpload"
                                                                class="block w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-purple-100 file:text-purple-700 hover:file:bg-purple-200 file:cursor-pointer">
                                                            <textarea v-model="settings.ttsCloneReferenceText" rows="2" maxlength="500"
                                                                placeholder="Reference transcript — the exact text spoken in the clip"
                                                                class="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-300"></textarea>
                                                            <div class="text-[10px]" :class="cloneVoiceReady ? 'text-emerald-600' : 'text-gray-400'">
                                                                {{ cloneVoiceReady ? 'Reference clip and transcript ready.' : 'Upload a clean 3-10s clip and type its exact transcript.' }}
                                                            </div>
                                                        </div>
                                                        <div class="text-[10px] text-gray-400 leading-relaxed">Voice models download on demand and stay on this device. The pitch slider is only approximated during playback for neural voices.</div>
                                                                </div>
                                                </div>
                                                </div>
                                            </div>
    
                                            <!-- 朗读偏好：所有引擎通用 -->
                                            <div class="space-y-4">
                                                <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">朗读偏好</label>
                                                <div class="flex items-center justify-between">
                                                    <div>
                                                        <div class="text-sm font-bold text-gray-700">自动朗读</div>
                                                        <div class="text-[10px] text-gray-400 mt-0.5">角色回复生成完成后自动朗读，新发送消息时自动停止。</div>
                                                    </div>
                                                    <label class="relative inline-flex items-center cursor-pointer">
                                                        <input type="checkbox" v-model="settings.ttsAutoPlay" class="settings-toggle-input sr-only">
                                                        <div class="settings-toggle settings-toggle--indigo"></div>
                                                    </label>
                                                </div>
                                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <div class="flex justify-between items-center mb-1.5">
                                                            <label class="text-xs font-medium text-gray-500">语速</label>
                                                            <span class="text-xs font-mono text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100">{{ (Number(settings.ttsRate) || 1).toFixed(2) }}</span>
                                                        </div>
                                                        <input type="range" v-model.number="settings.ttsRate" min="0.5" max="2" step="0.05"
                                                            class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-500">
                                                    </div>
                                                    <div>
                                                        <div class="flex justify-between items-center mb-1.5">
                                                            <label class="text-xs font-medium text-gray-500">音调</label>
                                                            <span class="text-xs font-mono text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100">{{ (Number(settings.ttsPitch) || 1).toFixed(2) }}</span>
                                                        </div>
                                                        <input type="range" v-model.number="settings.ttsPitch" min="0.5" max="2" step="0.05"
                                                            class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-500">
                                                    </div>
                                                </div>
                                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">朗读内容</label>
                                                        <select v-model="ttsReadMode"
                                                            class="w-full bg-gray-50/60 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:bg-white transition-all">
                                                            <option value="full">全文朗读</option>
                                                            <option value="dialogue">只读台词（引号内容）</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label class="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 ml-1">最长朗读字数</label>
                                                        <div class="flex items-center gap-2">
                                                            <input type="number" v-model.number="settings.ttsMaxChars" min="100" max="5000" step="100"
                                                                class="w-full bg-gray-50/60 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:bg-white transition-all">
                                                            <span class="text-[10px] text-gray-400">字</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <label class="flex items-center p-3 rounded-xl border-2 border-transparent hover:border-gray-100 hover:bg-gray-50 transition-all cursor-pointer group">
                                                    <input type="checkbox" v-model="settings.ttsSkipActions" class="rounded accent-teal-500 mr-2.5">
                                                    <span class="text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">跳过动作叙述（*…* 行）</span>
                                                </label>
                                                <div class="flex items-center justify-between p-3 rounded-xl bg-gray-50/60 border border-gray-100">
                                                    <span class="text-xs text-gray-500">朗读效果受所选引擎与语速音调影响。</span>
                                                    <button type="button" @click="testTtsVoice"
                                                        class="px-3 py-1.5 text-xs font-bold text-white bg-teal-500 hover:bg-teal-600 rounded-lg shadow-sm transition-all active:scale-95">
                                                        测试朗读
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
    </div>
</template>

<script>
import { inject } from "vue";
export default {
    setup() {
        const ctx = inject("appContext");
        return ctx || {};
    }
};
</script>
