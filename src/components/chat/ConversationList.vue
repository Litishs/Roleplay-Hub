<template>
    <!-- Conversation list. Rendered twice: as the home screen (default entry
         point, replaces the old "chat is the app root" model) and as the
         wide-screen side column next to the open chat. -->
    <div class="conversation-list flex flex-col h-full min-h-0 bg-gray-50"
        :class="compact ? 'conversation-list--compact' : ''">
        <!-- bg-white/90, not /85: the dark-theme override in styles.css covers
             the 10-step opacity scale (40/50/60/70/80/90/95) only, so a stray
             /85 stayed white in dark mode and lit up this whole bar. -->
        <header class="flex items-center gap-2 flex-shrink-0 border-b border-gray-200 bg-white/90 px-4"
            :class="compact ? 'h-12' : 'h-14'">
            <!-- Same title spec as the other tab roots (2026-11-24): 20px/24px on
                 phones, 24px/28 on wide screens, 24px primary glyph. The compact
                 side column stays icon-free and text-sm to keep its density. -->
            <h2 class="flex items-center font-bold text-gray-800 truncate"
                :class="compact ? 'text-sm' : 'text-xl md:text-2xl'">
                <svg v-if="!compact" class="w-6 h-6 md:w-7 md:h-7 mr-2 flex-shrink-0 text-primary-600"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
                </svg>
                会话
            </h2>
            <div class="ml-auto flex items-center gap-1">
                <button type="button" @click="currentView = 'characters'"
                    class="p-2 rounded-xl bg-gray-100 text-gray-600 hover:text-primary-600 hover:bg-gray-200 transition-colors"
                    :title="compact ? '角色卡管理' : '管理角色卡'" aria-label="角色卡管理">
                    <svg class="w-4.5 h-4.5" style="width:1.125rem;height:1.125rem" fill="none" stroke="currentColor"
                        viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                    </svg>
                </button>
                <!-- Direct blank-card creation (2026-11-24) between management and
                     import: the management view's add menu still offers the same
                     action, but creating a card is common enough to be one tap
                     from the list. -->
                <button type="button" @click="createNewCharacter"
                    class="p-2 rounded-xl bg-gray-100 text-gray-600 hover:text-primary-600 hover:bg-gray-200 transition-colors"
                    title="新建角色卡" aria-label="新建角色卡">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M12 4v16m8-8H4"></path>
                    </svg>
                </button>
                <button type="button" @click="importInputRef?.click()"
                    class="p-2 rounded-xl bg-gray-100 text-gray-600 hover:text-primary-600 hover:bg-gray-200 transition-colors"
                    title="导入角色卡" aria-label="导入角色卡">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                    </svg>
                </button>
                <input ref="importInputRef" type="file" accept=".png,.json" @change="importCharacter($event)"
                    class="hidden" aria-hidden="true">
            </div>
        </header>

        <div v-if="!compact" class="flex-shrink-0 px-4 pt-3">
            <div class="relative">
                <input v-model="query" type="text" inputmode="search" placeholder="搜索角色卡..."
                    class="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-700 placeholder:text-gray-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20" />
                <svg class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none"
                    stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
            </div>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto custom-scrollbar" :class="compact ? 'px-1.5 py-1.5' : 'px-2 py-2'">
            <button v-for="item in visibleConversations" :key="item.char.uuid || item.index" type="button"
                @click="openConversation(item)"
                :class="['conversation-row w-full flex items-center text-left transition-colors rounded-xl',
                    compact ? 'gap-2 px-1.5 py-1.5' : 'gap-3 px-2.5 py-2.5',
                    item.index === currentCharacterIndex ? 'is-active' : '']">
                <span class="relative flex-shrink-0 rounded-full overflow-hidden border border-gray-200 bg-gray-100"
                    :class="compact ? 'w-8 h-8' : 'w-11 h-11'">
                    <img v-if="item.char.avatar && !avatarFailed(item)" :src="item.char.avatar" alt=""
                        class="h-full w-full object-cover" @error="markAvatarFailed(item)" />
                    <span v-else
                        class="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary-500 to-primary-600 font-bold text-white"
                        :class="compact ? 'text-[11px]' : 'text-sm'">
                        {{ (item.char.name || '?').charAt(0).toUpperCase() }}
                    </span>
                    <span v-if="isUnread(item) && !isGeneratingHere(item)"
                        class="absolute right-0 top-0 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white"
                        aria-label="有新回复"></span>
                </span>

                <span class="min-w-0 flex-1">
                    <span class="flex items-baseline gap-2">
                        <span class="truncate font-bold text-gray-800" :class="compact ? 'text-[13px]' : 'text-sm'">
                            {{ item.char.name || '未命名角色' }}
                        </span>
                        <span class="ml-auto flex-shrink-0 text-[10px] text-gray-400 tabular-nums">
                            {{ formatConversationTime(item.summary && item.summary.at) }}
                        </span>
                    </span>
                    <span class="mt-0.5 flex items-center gap-1.5 text-gray-500" :class="compact ? 'text-[11px]' : 'text-xs'">
                        <span v-if="isGeneratingHere(item)"
                            class="flex-shrink-0 rounded bg-primary-100 px-1 text-[9px] font-bold text-primary-700">生成中</span>
                        <span class="truncate">{{ previewFor(item) }}</span>
                    </span>
                </span>
            </button>

            <div v-if="!visibleConversations.length" class="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
                <div class="flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-gray-400">
                    <svg class="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.6"
                            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    </svg>
                </div>
                <p class="text-sm font-medium text-gray-600">{{ query ? '没有匹配的角色卡' : '还没有角色卡' }}</p>
                <button v-if="!query" type="button" @click="currentView = 'characters'"
                    class="rounded-xl bg-primary-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-700">
                    去角色卡管理
                </button>
            </div>
        </div>
    </div>
</template>

<script>
import { computed, inject, ref } from "vue";

// Relative labels are enough for a conversation list: exact timestamps are one
// tap away inside the chat.
const formatConversationTime = (value) => {
  const at = Number(value) || 0;
  if (!at) return '';
  const date = new Date(at);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const pad = (n) => String(n).padStart(2, '0');
  if (sameDay) return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const yesterday = new Date(now.getTime() - 86400000);
  if (date.toDateString() === yesterday.toDateString()) return '昨天';
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}/${date.getDate()}`;
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
};

export default {
  props: {
    // Side column next to the chat on wide screens: tighter rows, no search.
    compact: { type: Boolean, default: false }
  },
  setup() {
    const ctx = inject("appContext");
    const query = ref('');
    // Hidden card-import input opened by the header button; importCharacter
    // accepts .png/.json and resets the input itself after each run.
    const importInputRef = ref(null);

    // Thumbnails must never render blank: PNG imports carry the card image as
    // a data URL, JSON imports fall back to a gray placeholder, and when even
    // that image fails to decode (corrupt backup, bad data URL) the row falls
    // back to the letter circle below.
    const avatarFailures = ref(new Set());
    const avatarKey = (item) => item.char?.uuid || `${item.index}:${item.char?.name || ''}`;
    const markAvatarFailed = (item) => {
        const key = avatarKey(item);
        if (!avatarFailures.value.has(key)) {
            const next = new Set(avatarFailures.value);
            next.add(key);
            avatarFailures.value = next;
        }
    };
    const avatarFailed = (item) => avatarFailures.value.has(avatarKey(item));

    // ctx entries are refs/computeds; unwrap before deciding the shape.
    const unwrap = (value) => (value && typeof value === 'object' && 'value' in value ? value.value : value);

    const conversations = computed(() => {
      const sorted = unwrap(ctx?.sortedConversations);
      return Array.isArray(sorted) ? sorted : [];
    });

    const visibleConversations = computed(() => {
      const needle = query.value.trim().toLowerCase();
      if (!needle) return conversations.value;
      return conversations.value.filter(item => {
        const name = String(item.char?.name || '').toLowerCase();
        const description = String(item.char?.description || '').toLowerCase();
        return name.includes(needle) || description.includes(needle);
      });
    });

    const isGeneratingHere = (item) => !!(ctx?.isGenerating?.value || ctx?.isRemoteGenerating?.value)
      && item.index === ctx?.currentCharacterIndex?.value;

    const isUnread = (item) => !!item.summary
      && Number(item.summary.at) > Number(item.summary.readAt || 0)
      && item.index !== ctx?.currentCharacterIndex?.value;

    const previewFor = (item) => {
      const preview = item.summary && item.summary.preview;
      if (preview) return preview;
      const description = String(item.char?.description || '').trim();
      if (description) return description;
      return '还没有对话';
    };

    const openConversation = (item) => {
      if (typeof ctx?.selectCharacter === 'function') ctx.selectCharacter(item.index);
    };

    return {
      query,
      importInputRef,
      avatarFailed,
      markAvatarFailed,
      visibleConversations,
      isGeneratingHere,
      isUnread,
      previewFor,
      openConversation,
      formatConversationTime,
      ...(ctx || {})
    };
  }
};
</script>
