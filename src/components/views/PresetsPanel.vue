<template>
            <div v-if="currentView === 'presets'" class="management-view">
                <settings-page-header title="预设管理" @menu="toggleMobileMenu">
                    <template #icon>
                        <svg class="w-6 h-6 md:w-7 md:h-7 mr-2 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path>
                        </svg>
                    </template>
                    <!-- 分组级操作（白色） -->
                    <button @click="openExportModal('presets')" class="settings-icon-button" title="导出分组">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-export"></use></svg>
                    </button>
                    <label class="settings-icon-button cursor-pointer" title="导入分组">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><use href="#icon-import"></use></svg>
                        <input type="file" accept=".json" @change="importPresets" class="hidden">
                    </label>
                    <button @click="openCreateGroupModal" class="settings-icon-button" title="新建分组">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                        </svg>
                    </button>
                </settings-page-header>

                <div id="presets-list" class="space-y-4">
                    <!-- 预设分组（手风琴） -->
                    <section v-for="group in presetGroupsView" :key="group.id"
                        class="settings-accordion" :class="{'is-open': isGroupOpen(group.id)}">
                        <button type="button"
                            @click="toggleGroup(group.id)"
                            class="settings-accordion-trigger" :aria-expanded="isGroupOpen(group.id)"
                            :aria-controls="'preset-group-panel-' + group.id">
                            <span class="settings-accordion-icon settings-accordion-avatar">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"></path>
                                </svg>
                            </span>
                            <span class="settings-accordion-copy">
                                <span class="settings-accordion-title">
                                    {{ group.name }}
                                    <span v-if="group.builtin"
                                        class="hidden md:inline-flex text-[10px] px-2 py-0.5 rounded-full border font-bold align-middle ml-1 bg-gray-100 text-gray-500 border-gray-300">内置</span>
                                </span>
                                <span class="settings-accordion-description">
                                    {{ group.presetCount }} 条预设 · {{ group.enabled ? '启用中' : '未启用' }}
                                </span>
                            </span>
                            <span class="settings-accordion-summary" @click.stop>
                                <label class="relative inline-flex items-center cursor-pointer" title="启用/关闭该分组（同一时间仅启用一个分组）">
                                    <input type="checkbox" class="settings-toggle-input sr-only"
                                        :checked="group.enabled"
                                        @change="setActivePresetGroup(group.id)">
                                    <div class="settings-toggle"></div>
                                </label>
                                <button v-if="!group.builtin" @click="deletePresetGroup(group.id)"
                                    class="settings-icon-button settings-icon-button--danger ml-3" title="删除分组">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-delete"></use></svg>
                                </button>
                            </span>
                            <svg :class="{'rotate-180': isGroupOpen(group.id)}"
                                class="settings-collapse-chevron settings-accordion-chevron" fill="none"
                                stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                            </svg>
                        </button>

                        <div :id="'preset-group-panel-' + group.id" class="settings-collapse"
                            :class="{'is-open': isGroupOpen(group.id)}"
                            :aria-hidden="!isGroupOpen(group.id)" :inert="!isGroupOpen(group.id)">
                            <div class="settings-collapse__inner">
                                <div class="settings-collapse__content settings-panel-body">
                                    <!-- 组内新建条目（蓝色） -->
                                    <button @click="createPreset(group.id)"
                                        class="settings-create-button inline-flex items-center gap-1 text-sm px-3 py-2 mb-3" title="在该分组新建预设">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
                                        </svg>
                                        新建预设
                                    </button>
                                    <p v-if="group.presets.length === 0" class="text-xs text-gray-400 py-2">
                                        该分组暂无预设
                                    </p>
                                    <div v-for="(item, index) in group.presets" :key="item.preset.name + index"
                                        class="bg-white p-4 rounded-xl border border-gray-200 flex items-center justify-between group shadow-sm hover:shadow-md transition-all mb-2">
                                        <div class="flex items-center flex-1 min-w-0 mr-4">
                                            <div class="cursor-move text-gray-400 mr-3 hover:text-gray-600 flex-shrink-0" title="拖动排序">
                                                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                                        d="M4 8h16M4 16h16"></path>
                                                </svg>
                                            </div>
                                            <div class="flex-1 min-w-0">
                                                <div class="flex items-center gap-2 min-w-0">
                                                    <h3 class="font-bold text-gray-800 truncate">{{ item.preset.name }}</h3>
                                                    <span :class="['hidden md:inline-flex text-[10px] px-2 py-0.5 rounded-full border font-bold flex-shrink-0', getPresetRoleBadgeClass(item.preset)]">
                                                        {{ getPresetRoleDisplayLabel(item.preset) }}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="flex items-center space-x-4 flex-shrink-0">
                                            <label class="relative inline-flex items-center cursor-pointer">
                                                <input type="checkbox" v-model="item.preset.enabled" class="settings-toggle-input sr-only">
                                                <div class="settings-toggle"></div>
                                            </label>
                                            <!-- 组内条目操作（蓝色） -->
                                            <div class="flex space-x-1 border-l border-gray-200 pl-4">
                                                <button @click="editPreset(item.index)"
                                                    class="item-action-button item-action-button--edit"
                                                    title="编辑">
                                                    <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-edit"></use></svg>
                                                </button>
                                                <button @click="deletePreset(item.index)"
                                                    class="item-action-button item-action-button--delete"
                                                    title="删除">
                                                    <svg class="w-5 h-5" fill="none" stroke="currentColor"><use href="#icon-delete"></use></svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                <!-- 新建分组弹窗（应用自带 fixed overlay 模态） -->
                <div v-if="showCreateGroupModal"
                    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div class="bg-white rounded-2xl border border-gray-200 w-full max-w-md flex flex-col shadow-2xl max-h-[94vh] overflow-hidden">
                        <div class="editor-modal-header">
                            <div class="flex items-center gap-3">
                                <div class="p-2 bg-primary-50 text-primary-600 rounded-lg">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"></path>
                                    </svg>
                                </div>
                                <h3 class="text-lg font-bold text-gray-800 leading-tight">新建预设分组</h3>
                            </div>
                            <button @click="showCreateGroupModal = false"
                                class="modal-close-button">
                                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                                        d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>
                        <div class="flex-1 p-6 space-y-4 bg-gray-50/30 overflow-y-auto custom-scrollbar">
                            <div>
                                <label class="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5">分组名称</label>
                                <input v-model="newGroupName" type="text" placeholder="请输入分组名称"
                                    class="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 focus:outline-none transition-all shadow-sm font-medium" />
                            </div>
                            <div class="space-y-2">
                                <label class="flex items-start gap-3 p-3 rounded-xl border cursor-pointer hover:bg-gray-50">
                                    <input type="radio" value="default" v-model="newGroupSeed" class="mt-1">
                                    <span class="flex-1">
                                        <span class="block text-sm font-bold text-gray-800">基于默认预设新建</span>
                                        <span class="block text-xs text-gray-500">自动复制当前全部默认预设作为该分组的初始条目</span>
                                    </span>
                                </label>
                                <label class="flex items-start gap-3 p-3 rounded-xl border cursor-pointer hover:bg-gray-50">
                                    <input type="radio" value="blank" v-model="newGroupSeed" class="mt-1">
                                    <span class="flex-1">
                                        <span class="block text-sm font-bold text-gray-800">基于空白分组新建</span>
                                        <span class="block text-xs text-gray-500">创建一个不含初始预设条目的空分组</span>
                                    </span>
                                </label>
                            </div>
                        </div>
                        <div class="p-4 md:p-5 border-t border-gray-100 flex justify-end space-x-3 bg-gray-50/80 backdrop-blur-sm flex-shrink-0">
                            <button @click="showCreateGroupModal = false"
                                    class="modal-secondary-button">取消</button>
                            <button @click="confirmCreateGroup"
                                class="modal-primary-button">创建</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- UI Templates View -->
</template>

<script>
import { inject, ref, computed } from "vue";
import SettingsPageHeader from "../common/SettingsPageHeader.vue";
// 2026-08-28 Phase 1.6: shared components are declared locally now that the
// app-level global registration workaround has been removed.
export default {
  components: { SettingsPageHeader },
  setup() {
    const ctx = inject("appContext");
    const app = ctx || {};

    // 手风琴展开状态（默认展开默认预设组）
    // appContext 里的 presetGroups/presets 是 ref，模板会自动解包；此处 JS 需取 .value
    const openGroupIds = ref(new Set((app.presetGroups?.value || []).filter(g => g.builtin).map(g => g.id)));
    const isGroupOpen = (id) => openGroupIds.value.has(id);
    const toggleGroup = (id) => {
      const next = new Set(openGroupIds.value);
      if (next.has(id)) next.delete(id); else next.add(id);
      openGroupIds.value = next;
    };

    // 分组视图：每个分组携带组内预设（含全局 index，供 editPreset/deletePreset 使用）
    const presetGroupsView = computed(() => {
      const groups = Array.isArray(app.presetGroups?.value) ? app.presetGroups.value : [];
      const allPresets = Array.isArray(app.presets?.value) ? app.presets.value : [];
      return groups.map(g => ({
        ...g,
        presetCount: allPresets.filter(p => (p.group || 'default') === g.id).length,
        presets: allPresets
          .map((preset, index) => ({ preset, index }))
          .filter(({ preset }) => (preset.group || 'default') === g.id)
      }));
    });

    // 新建分组弹窗
    const showCreateGroupModal = ref(false);
    const newGroupName = ref('');
    const newGroupSeed = ref('default');
    const openCreateGroupModal = () => {
      newGroupName.value = '';
      newGroupSeed.value = 'default';
      showCreateGroupModal.value = true;
    };
    const confirmCreateGroup = () => {
      app.createPresetGroup?.({ name: newGroupName.value, seedFromDefault: newGroupSeed.value === 'default' });
      showCreateGroupModal.value = false;
    };

    return {
      ...app,
      presetGroupsView,
      isGroupOpen,
      toggleGroup,
      showCreateGroupModal,
      newGroupName,
      newGroupSeed,
      openCreateGroupModal,
      confirmCreateGroup
    };
  }
};
</script>
