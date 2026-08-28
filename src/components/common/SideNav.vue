<template>
    <!-- Mobile Sidebar Overlay -->
    <div @click="closeMobileMenu"
        class="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 md:hidden mobile-overlay">
    </div>

    <!-- Sidebar (Desktop & Mobile Drawer) -->
    <div
        class="app-sidebar fixed inset-y-0 left-0 z-50 w-72 bg-white/95 border-r border-gray-200/80 transform transition-all duration-300 md:relative md:translate-x-0 flex flex-col shadow-2xl md:shadow-sm md:rounded-none rounded-r-3xl overflow-hidden"
        :class="[isSidebarCollapsed ? 'md:w-16' : 'md:w-72']">
        <!-- Sidebar Header -->
        <div class="h-16 flex items-center border-b border-gray-100/80 bg-white/70 backdrop-blur-xl transition-all duration-300"
            :class="isSidebarCollapsed ? 'justify-center px-0' : 'justify-between px-6'">
            <div v-show="!isSidebarCollapsed" class="app-logo relative inline-flex items-baseline gap-1.5 pr-1 min-w-0">
                <span class="text-[21px] font-extrabold text-gray-800 tracking-[0.08em] leading-none">RP</span>
                <span class="text-[16px] font-semibold text-primary-600 tracking-[0.18em] leading-none">HUB</span>
                <span class="absolute -bottom-1 left-0 h-[2px] w-11 rounded-full bg-primary-500/60"></span>
            </div>
            <button @click="isSidebarCollapsed = !isSidebarCollapsed"
                :class="['hidden md:flex items-center justify-center bg-white hover:bg-gray-50 border border-gray-200/80 rounded-xl text-gray-500 hover:text-primary-600 transition-all shadow-sm active:scale-95', isSidebarCollapsed ? 'w-12 h-12 p-0' : 'p-2']"
                :title="isSidebarCollapsed ? '展开侧边栏' : '收起侧边栏'">
                <svg v-if="!isSidebarCollapsed" class="w-5 h-5" fill="none" stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M11 19l-7-7 7-7M20 12H4"></path>
                </svg>
                <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M4 12h16">
                    </path>
                </svg>
            </button>
        </div>

        <!-- Navigation -->
        <div class="sidebar-nav custom-scrollbar flex-1 overflow-y-auto py-4 transition-all duration-300"
            :class="isSidebarCollapsed ? 'px-2 space-y-2' : 'px-3 space-y-1.5'">
            <button @click="currentView = 'chat'; closeMobileMenu()"
                title="聊天"
                :class="['sidebar-nav-button flex items-center rounded-xl transition-all duration-200 font-medium', currentView === 'chat' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900', isSidebarCollapsed ? 'w-12 h-12 mx-auto justify-center p-0' : 'w-full px-3 py-2.5']">
                <svg class="w-5 h-5" :class="isSidebarCollapsed ? 'mr-0' : 'mr-3'" fill="none" stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z">
                    </path>
                </svg>
                <span v-show="!isSidebarCollapsed" class="whitespace-nowrap overflow-hidden">聊天</span>
            </button>
            <button @click="currentView = 'usage'; closeMobileMenu()"
                title="用量统计"
                :class="['sidebar-nav-button flex items-center rounded-xl transition-all duration-200 font-medium', currentView === 'usage' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900', isSidebarCollapsed ? 'w-12 h-12 mx-auto justify-center p-0' : 'w-full px-3 py-2.5']">
                <svg class="w-5 h-5" :class="isSidebarCollapsed ? 'mr-0' : 'mr-3'" fill="none" stroke="currentColor"
                    viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M4 19V9m5 10V5m5 14v-7m5 7V3M3 21h18"></path>
                </svg>
                <span v-show="!isSidebarCollapsed" class="whitespace-nowrap overflow-hidden">用量统计</span>
            </button>
            <button @click="currentView = 'memory'; closeMobileMenu()"
                title="记忆系统"
                :class="['sidebar-nav-button flex items-center rounded-xl transition-all duration-200 font-medium', currentView === 'memory' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900', isSidebarCollapsed ? 'w-12 h-12 mx-auto justify-center p-0' : 'w-full px-3 py-2.5']">
                <svg class="w-5 h-5" :class="isSidebarCollapsed ? 'mr-0' : 'mr-3'" fill="none" stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z">
                    </path>
                </svg>
                <span v-show="!isSidebarCollapsed" class="whitespace-nowrap overflow-hidden">记忆系统</span>
            </button>
            <button @click="currentView = 'uitemplates'; closeMobileMenu()"
                title="UI模板"
                :class="['sidebar-nav-button flex items-center rounded-xl transition-all duration-200 font-medium', currentView === 'uitemplates' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900', isSidebarCollapsed ? 'w-12 h-12 mx-auto justify-center p-0' : 'w-full px-3 py-2.5']">
                <svg class="w-5 h-5" :class="isSidebarCollapsed ? 'mr-0' : 'mr-3'" fill="none" stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M4 5a2 2 0 012-2h12a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm4 3h8M8 12h8M8 16h5">
                    </path>
                </svg>
                <span v-show="!isSidebarCollapsed" class="whitespace-nowrap overflow-hidden">UI模板</span>
                <span v-if="!isSidebarCollapsed && uiTemplateUpdateStatus.state === 'running'" class="ml-auto">
                    <span class="inline-block w-2 h-2 rounded-full bg-primary-500 memory-extracting"></span>
                </span>
            </button>
            <button @click="currentView = 'characters'; closeMobileMenu()"
                title="角色卡管理"
                :class="['sidebar-nav-button flex items-center rounded-xl transition-all duration-200 font-medium', currentView === 'characters' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900', isSidebarCollapsed ? 'w-12 h-12 mx-auto justify-center p-0' : 'w-full px-3 py-2.5']">
                <svg class="w-5 h-5" :class="isSidebarCollapsed ? 'mr-0' : 'mr-3'" fill="none" stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z">
                    </path>
                </svg>
                <span v-show="!isSidebarCollapsed" class="whitespace-nowrap overflow-hidden">角色卡管理</span>
            </button>
            <button @click="currentView = 'generator'; closeMobileMenu()"
                title="角色卡生成"
                :class="['sidebar-nav-button flex items-center rounded-xl transition-all duration-200 font-medium', currentView === 'generator' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900', isSidebarCollapsed ? 'w-12 h-12 mx-auto justify-center p-0' : 'w-full px-3 py-2.5']">
                <svg class="w-5 h-5" :class="isSidebarCollapsed ? 'mr-0' : 'mr-3'" fill="none" stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                </svg>
                <span v-show="!isSidebarCollapsed" class="whitespace-nowrap overflow-hidden">角色卡生成</span>
            </button>
            <button @click="currentView = 'square'; closeMobileMenu()"
                title="万相广场"
                :class="['sidebar-nav-button flex items-center rounded-xl transition-all duration-200 font-medium', currentView === 'square' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900', isSidebarCollapsed ? 'w-12 h-12 mx-auto justify-center p-0' : 'w-full px-3 py-2.5']">
                <svg class="w-5 h-5" :class="isSidebarCollapsed ? 'mr-0' : 'mr-3'" fill="none" stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9">
                    </path>
                </svg>
                <span v-show="!isSidebarCollapsed" class="whitespace-nowrap overflow-hidden">万相广场</span>
            </button>

            <div class="advanced-nav"
                :class="{ 'is-open': isAdvancedNavOpen && !isSidebarCollapsed }">
                <button @click="toggleAdvancedNav"
                    class="sidebar-nav-button advanced-nav-trigger flex items-center rounded-xl transition-all duration-200 font-medium"
                    :class="[['presets', 'worldinfo', 'regex', 'tools'].includes(currentView) ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900', isSidebarCollapsed ? 'w-12 h-12 mx-auto justify-center p-0' : 'w-full px-3 py-2.5']"
                    title="高级"
                    aria-controls="advanced-nav-panel"
                    :aria-expanded="isAdvancedNavOpen && !isSidebarCollapsed">
                    <svg class="w-5 h-5" :class="isSidebarCollapsed ? 'mr-0' : 'mr-3'" fill="none"
                        stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M4 7.5h16M7.5 3v9m9 0v9M4 16.5h16"></path>
                        <circle cx="7.5" cy="16.5" r="2" fill="white" stroke="currentColor" stroke-width="2"></circle>
                        <circle cx="16.5" cy="7.5" r="2" fill="white" stroke="currentColor" stroke-width="2"></circle>
                    </svg>
                    <span v-show="!isSidebarCollapsed" class="whitespace-nowrap overflow-hidden">高级</span>
                    <svg v-show="!isSidebarCollapsed" class="advanced-nav-chevron ml-auto w-4 h-4" fill="none"
                        stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                    </svg>
                </button>

                <div id="advanced-nav-panel" class="advanced-nav-panel"
                    :aria-hidden="!(isAdvancedNavOpen && !isSidebarCollapsed)"
                    :inert="!(isAdvancedNavOpen && !isSidebarCollapsed)">
                    <div class="advanced-nav-panel-inner">
                        <div class="advanced-nav-list">
                            <button @click="currentView = 'presets'; closeMobileMenu()"
                                class="sidebar-nav-button advanced-nav-item transition-all duration-200"
                                :class="currentView === 'presets' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
                                title="预设">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
                                        d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4M6 18a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4">
                                    </path>
                                </svg>
                                <span>预设</span>
                            </button>
                            <button @click="currentView = 'worldinfo'; closeMobileMenu()"
                                class="sidebar-nav-button advanced-nav-item transition-all duration-200"
                                :class="currentView === 'worldinfo' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
                                title="世界书">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
                                        d="M12 6.25v13m0-13C10.83 5.48 9.25 5 7.5 5S4.17 5.48 3 6.25v13C4.17 18.48 5.75 18 7.5 18s3.33.48 4.5 1.25m0-13C13.17 5.48 14.75 5 16.5 5S19.83 5.48 21 6.25v13C19.83 18.48 18.25 18 16.5 18s-3.33.48-4.5 1.25">
                                    </path>
                                </svg>
                                <span>世界书</span>
                            </button>
                            <button @click="currentView = 'regex'; closeMobileMenu()"
                                class="sidebar-nav-button advanced-nav-item transition-all duration-200"
                                :class="currentView === 'regex' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
                                title="正则脚本">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
                                        d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
                                </svg>
                                <span>正则</span>
                            </button>
                            <button @click="currentView = 'tools'; closeMobileMenu()"
                                class="sidebar-nav-button advanced-nav-item transition-all duration-200"
                                :class="currentView === 'tools' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'"
                                title="工具">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8"
                                        d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94L14.7 6.3z">
                                    </path>
                                </svg>
                                <span>工具</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <button @click="currentView = 'settings'; closeMobileMenu()"
                title="设置"
                :class="['sidebar-nav-button flex items-center rounded-xl transition-all duration-200 font-medium', currentView === 'settings' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900', isSidebarCollapsed ? 'w-12 h-12 mx-auto justify-center p-0' : 'w-full px-3 py-2.5']">
                <svg class="w-5 h-5" :class="isSidebarCollapsed ? 'mr-0' : 'mr-3'" fill="none" stroke="currentColor" viewBox="0 0 24 24"><use href="#icon-settings"></use></svg>
                <span v-show="!isSidebarCollapsed" class="whitespace-nowrap overflow-hidden">设置</span>
            </button>

        </div>

        <!-- User Profile Mini -->
        <div class="p-3 border-t border-gray-100/80 bg-white/70 backdrop-blur-xl">
            <div @click="showUserSetupModal = true"
                class="flex items-center cursor-pointer transition-all select-none"
                :class="isSidebarCollapsed ? 'justify-center' : 'rounded-2xl border border-gray-200/70 bg-gray-50/80 px-3 py-2 shadow-sm hover:border-primary-200 hover:bg-primary-50/50'">
                <div class="w-10 h-10 rounded-2xl overflow-hidden shadow-sm flex-shrink-0 ring-2 ring-white">
                    <img v-if="user?.avatar" :src="user?.avatar" class="w-full h-full object-cover">
                    <div v-else
                        class="w-full h-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center text-white font-bold">
                        {{ user.name.charAt(0).toUpperCase() }}
                    </div>
                </div>
                <div v-if="!isSidebarCollapsed" class="ml-3 whitespace-nowrap overflow-hidden">
                    <div class="text-sm font-bold text-gray-900 truncate">{{ user.name }}</div>
                    <div class="text-xs text-gray-500">User</div>
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