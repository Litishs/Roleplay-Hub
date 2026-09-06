<template>
    <div>
                                        <div class="flex items-center justify-between mb-4">
                                            <div>
                                                <div class="text-sm font-bold text-gray-700">启用语音朗读</div>
                                                <div class="text-[10px] text-gray-400 mt-0.5">使用语音引擎朗读角色回复。</div>
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
                                                    <button type="button" @click="selectTtsService('cloud')"
                                                        :class="['p-3 rounded-xl border-2 text-left transition-all', settings.ttsService === 'cloud' ? 'border-teal-400 bg-teal-50/60' : 'border-gray-100 hover:border-gray-200']">
                                                        <div class="text-sm font-bold" :class="settings.ttsService === 'cloud' ? 'text-teal-700' : 'text-gray-700'">云端 API</div>
                                                        <div class="text-[10px] text-gray-400 mt-0.5">OpenAI 兼容接口，按量计费</div>
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
                                                        <span class="text-xs font-medium text-gray-500">引擎状态</span>
                                                        <span class="text-xs font-bold" :class="ttsStatus.available ? 'text-emerald-600' : 'text-red-500'">{{ ttsStatusLabel }}</span>
                                                    </div>
                                                    <div>
                                                        <label class="block text-xs font-medium text-gray-500 mb-1">服务商</label>
                                                        <select v-model="settings.ttsCloudProviderId" @change="onTtsCloudProviderChange"
                                                            class="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300">
                                                            <option v-for="provider in ttsCloudProviderOptions" :key="provider.id" :value="provider.id">{{ provider.name }}</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label class="block text-xs font-medium text-gray-500 mb-1">Base URL</label>
                                                        <input type="text" v-model.trim="settings.ttsCloudBaseUrl" placeholder="https://api.example.com/v1"
                                                            class="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300">
                                                    </div>
                                                    <div>
                                                        <label class="block text-xs font-medium text-gray-500 mb-1">API Key</label>
                                                        <input type="password" v-model="settings.ttsCloudApiKey" autocomplete="off" placeholder="sk-...（留空表示无密钥端点）"
                                                            class="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300">
                                                        <div class="text-[10px] text-gray-400 mt-0.5">密钥经系统安全存储加密，不入备份。</div>
                                                    </div>
                                                    <div>
                                                        <label class="block text-xs font-medium text-gray-500 mb-1">模型</label>
                                                        <select v-if="ttsCloudModelOptions.length" v-model="settings.ttsCloudModel"
                                                            class="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300">
                                                            <option v-for="model in ttsCloudModelOptions" :key="model" :value="model">{{ model }}</option>
                                                        </select>
                                                        <input v-else type="text" v-model.trim="settings.ttsCloudModel" placeholder="tts-1"
                                                            class="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300">
                                                    </div>
                                                    <div>
                                                        <label class="block text-xs font-medium text-gray-500 mb-1">音色</label>
                                                        <select v-if="ttsCloudVoiceOptions.length" v-model="settings.ttsCloudVoice"
                                                            class="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300">
                                                            <option v-for="voice in ttsCloudVoiceOptions" :key="voice" :value="voice">{{ voice }}</option>
                                                        </select>
                                                        <input v-else type="text" v-model.trim="settings.ttsCloudVoice" placeholder="音色 id，取决于服务商"
                                                            class="w-full bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-300">
                                                        <div class="text-[10px] text-gray-400 mt-0.5">角色设置里的「角色音色」填写相同格式的音色 id 可按角色覆盖。</div>
                                                    </div>
                                                    <div>
                                                        <div class="flex justify-between items-center mb-1.5">
                                                            <label class="text-xs font-medium text-gray-500">语速</label>
                                                            <span class="text-xs font-mono text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100">{{ (Number(settings.ttsCloudSpeed) || 1).toFixed(2) }}</span>
                                                        </div>
                                                        <input type="range" v-model.number="settings.ttsCloudSpeed" min="0.25" max="4" step="0.05"
                                                            class="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-500">
                                                    </div>
                                                    <div class="text-[10px] text-gray-400 leading-relaxed">通过 OpenAI 兼容的 /audio/speech 接口合成，按句分段请求、顺序播放；合成失败自动回落系统语音。</div>
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
                                                            :disabled="settings.ttsService === 'cloud'"
                                                            :class="['w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-500', settings.ttsService === 'cloud' ? 'opacity-40' : '']">
                                                        <div v-if="settings.ttsService === 'cloud'" class="text-[10px] text-gray-400 mt-0.5">云端引擎不支持音调调节。</div>
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
