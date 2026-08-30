// useBackupRestore — full backup / restore via the native storage plugin (Phase 2, roadmap 2.2)
//
// Owns exportNativeBackup / restoreNativeBackup, previously inlined in
// app.mjs setup(): both flush pending persistence first (restore asks for
// confirmation and reloads the webview after the native restore replaces
// storage), guard reentrancy through the shared backupInProgress ref, and
// keep API keys out of the backup (handled natively, see
// tests/native-backup-contract.test.mjs for the plugin-side contract).
//
// Pattern contract (locked by tests/composables-contract.test.mjs):
// - deps-injecting logic factory: app.mjs passes the persistence/toast/
//   confirm collaborators and destructures the two functions; the wiring
//   sits right after showToast (the last dep) is defined.
// - RPHStorage is a direct module import (the app.mjs original used the
//   same module-level import).
// - The moved code is byte-identical to the app.mjs original.

import { RPHStorage } from '../modules/storage-repository.mjs';

export function useBackupRestore(deps) {
    const {
        // shared reentrancy guard + app.mjs orchestration
        backupInProgress,
        saveData,
        flushPendingChatHistorySave,
        showToast,
        showVueConfirmModal
    } = deps;

        const exportNativeBackup = async () => {
            if (backupInProgress.value) return;
            backupInProgress.value = true;
            try {
                await saveData();
                await flushPendingChatHistorySave();
                await RPHStorage.exportBackup();
                showToast('完整备份已保存', 'success');
            } catch (error) {
                if (!/cancel/i.test(String(error?.message || error || ''))) {
                    console.error('Backup export failed:', error);
                    showToast('完整备份失败：' + (error?.message || error), 'error', 5000);
                }
            } finally {
                backupInProgress.value = false;
            }
        };

        const restoreNativeBackup = async () => {
            if (backupInProgress.value) return;
            const confirmed = await showVueConfirmModal('恢复完整备份', '恢复将替换当前角色、聊天、记忆、设置和本地图片。API Key 不会从备份恢复。', { confirmLabel: '立即恢复', cancelLabel: '取消恢复' });
            if (!confirmed) return;
            backupInProgress.value = true;
            try {
                await RPHStorage.restoreBackup();
                window.location.reload();
            } catch (error) {
                if (!/cancel/i.test(String(error?.message || error || ''))) {
                    console.error('Backup restore failed:', error);
                    showToast('完整恢复失败，当前数据未被替换：' + (error?.message || error), 'error', 6000);
                }
            } finally {
                backupInProgress.value = false;
            }
        };

    return { exportNativeBackup, restoreNativeBackup };
}
