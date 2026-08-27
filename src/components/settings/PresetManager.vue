<template>
    <div class="user-settings-toolbar">
        <button type="button" class="user-settings-avatar" @click="$refs.userAvatarInput.click()"
            title="更换头像" aria-label="更换头像">
            <img v-if="user?.avatar" :src="user.avatar" alt="" class="w-full h-full object-cover">
            <span v-else>{{ (user.name || 'U').charAt(0).toUpperCase() }}</span>
            <span class="user-settings-avatar-edit" aria-hidden="true">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
                </svg>
            </span>
        </button>
        <input type="file" ref="userAvatarInput" accept="image/*"
            @change="handleUserAvatarUpload" class="hidden">

        <div class="relative profile-dropdown-container user-settings-profile-picker"
            :class="showProfileDropdown ? 'z-[60]' : 'z-10'">
            <button type="button" @click.stop="showProfileDropdown = !showProfileDropdown"
                class="user-settings-profile-trigger">
                <span class="min-w-0 text-left">
                    <span class="block font-semibold truncate">{{ user.name || '未命名人设' }}</span>
                    <span class="block text-xs text-gray-400 truncate mt-0.5">
                        当前人设 · {{ isSecondPerson ? '第二人称' : '第三人称' }}
                    </span>
                </span>
                <svg class="w-4 h-4 flex-shrink-0 text-gray-400 transition-transform"
                    :class="{'rotate-180': showProfileDropdown}" fill="none"
                    stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
            </button>

            <transition enter-active-class="transition-all duration-150 ease-out"
                enter-from-class="opacity-0 -translate-y-1 scale-95"
                enter-to-class="opacity-100 translate-y-0 scale-100"
                leave-active-class="transition-all duration-100 ease-in"
                leave-from-class="opacity-100 translate-y-0 scale-100"
                leave-to-class="opacity-0 -translate-y-1 scale-95">
                <div v-if="showProfileDropdown" class="user-settings-profile-menu">
                    <button v-for="profile in userProfiles" :key="profile.uuid" type="button"
                        @click="switchProfile(profile.uuid); showProfileDropdown = false"
                        class="user-settings-profile-option"
                        :class="{'is-active': activeProfileId === profile.uuid}">
                        <span class="user-settings-profile-option-avatar">
                            <img v-if="profile.avatar" :src="profile.avatar" alt="" class="w-full h-full object-cover">
                            <span v-else>{{ (profile.name || 'U').charAt(0).toUpperCase() }}</span>
                        </span>
                        <span class="min-w-0 flex-1 text-left">
                            <span class="block font-semibold truncate">{{ profile.name || '未命名人设' }}</span>
                            <span class="block text-[10px] text-gray-400 truncate mt-0.5">
                                {{ profile.person === 'second' ? '第二人称' : '第三人称' }}
                                <span v-if="profile.description"> · {{ profile.description.substring(0, 20) }}{{ profile.description.length > 20 ? '...' : '' }}</span>
                            </span>
                        </span>
                        <svg v-if="activeProfileId === profile.uuid" class="w-4 h-4 text-primary-500 flex-shrink-0"
                            fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
                        </svg>
                    </button>
                </div>
            </transition>
        </div>

        <button type="button" @click="createNewProfile" class="settings-icon-button"
            title="新建人设" aria-label="新建人设">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path>
            </svg>
        </button>
        <button type="button" @click="deleteProfile(activeProfileId)"
            class="settings-icon-button settings-icon-button--danger"
            title="删除当前人设" aria-label="删除当前人设">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
            </svg>
        </button>
    </div>

    <div class="user-settings-form">
        <div class="user-settings-form-grid">
            <label class="settings-field">
                <span class="settings-field-label">角色名</span>
                <input v-model="user.name" type="text" class="settings-form-control"
                    placeholder="您的名字">
            </label>
            <div class="settings-field">
                <span class="settings-field-label">叙事视角</span>
                <div class="segmented-switch">
                    <div class="segmented-switch__indicator" :class="{ 'is-right': !isSecondPerson }"></div>
                    <button type="button" @click="togglePerson('second')"
                        class="segmented-switch__option" :class="{ 'is-active': isSecondPerson }">
                        <span>第二人称</span><span class="text-xs font-normal opacity-80">（你）</span>
                    </button>
                    <button type="button" @click="togglePerson('third')"
                        class="segmented-switch__option" :class="{ 'is-active': !isSecondPerson }">
                        <span>第三人称</span><span class="text-xs font-normal opacity-80">（{{ user.name || '他/她' }}）</span>
                    </button>
                </div>
            </div>
        </div>
        <label class="settings-field">
            <span class="settings-field-label">详细设定</span>
            <textarea v-model="user.description" rows="4" class="settings-form-control settings-form-textarea"
                placeholder="描述您的外貌、性格、背景故事等..."></textarea>
        </label>
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
