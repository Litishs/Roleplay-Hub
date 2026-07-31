package com.roleplayhub.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.net.Uri;
import android.provider.Settings;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Iterator;
import java.util.Locale;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "NativeStorage")
public class NativeStoragePlugin extends Plugin {
    private static final String KEY_ALIAS = "roleplay_hub_secure_config";
    private static final String SECRET_PREFERENCES = "roleplay_hub_secrets";
    private static final String MEDIA_DIRECTORY = "media";
    private RoleplayDatabase database;

    @Override
    public void load() {
        database = new RoleplayDatabase(getContext());
    }

    @PluginMethod
    public void init(PluginCall call) {
        try {
            database.getWritableDatabase();
            if (!database.integrityCheck()) throw new IllegalStateException("SQLite integrity check failed");
            JSObject result = new JSObject();
            result.put("schemaVersion", RoleplayDatabase.DATABASE_VERSION);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to initialize native storage", error);
        }
    }

    @PluginMethod
    public void kvSet(PluginCall call) {
        String key = call.getString("key");
        String json = call.getString("json");
        if (key == null || json == null) { call.reject("key and json are required"); return; }
        try {
            database.putValue(key, json);
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to save value", error);
        }
    }

    @PluginMethod
    public void kvGet(PluginCall call) {
        String key = call.getString("key");
        if (key == null) { call.reject("key is required"); return; }
        try {
            JSObject result = new JSObject();
            result.put("json", database.getValue(key));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to read value", error);
        }
    }

    @PluginMethod
    public void kvRemove(PluginCall call) {
        String key = call.getString("key");
        if (key == null) { call.reject("key is required"); return; }
        try {
            database.removeValue(key);
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to remove value", error);
        }
    }

    @PluginMethod
    public void chatGet(PluginCall call) {
        String characterId = call.getString("characterId");
        if (characterId == null) { call.reject("characterId is required"); return; }
        try {
            JSObject result = new JSObject();
            result.put("json", database.getChat(characterId).toString());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to load chat", error);
        }
    }

    @PluginMethod
    public void chatApply(PluginCall call) {
        String characterId = call.getString("characterId");
        String changesJson = call.getString("changesJson");
        if (characterId == null || changesJson == null) { call.reject("characterId and changesJson are required"); return; }
        try {
            database.applyChatChanges(characterId, new JSONObject(changesJson));
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to update chat", error);
        }
    }

    @PluginMethod
    public void chatReplace(PluginCall call) {
        String characterId = call.getString("characterId");
        String messagesJson = call.getString("messagesJson");
        if (characterId == null || messagesJson == null) { call.reject("characterId and messagesJson are required"); return; }
        try {
            database.replaceChat(characterId, new JSONArray(messagesJson));
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to replace chat", error);
        }
    }

    @PluginMethod
    public void chatDelete(PluginCall call) {
        String characterId = call.getString("characterId");
        if (characterId == null) { call.reject("characterId is required"); return; }
        try {
            database.deleteChat(characterId);
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to delete chat", error);
        }
    }

    @PluginMethod
    public void secretSet(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || value == null) { call.reject("key and value are required"); return; }
        try {
            getSecretPreferences().edit().putString(key, encrypt(value)).apply();
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to save secret", error);
        }
    }

    @PluginMethod
    public void secretGet(PluginCall call) {
        String key = call.getString("key");
        if (key == null) { call.reject("key is required"); return; }
        try {
            String encrypted = getSecretPreferences().getString(key, null);
            JSObject result = new JSObject();
            result.put("value", encrypted == null ? null : decrypt(encrypted));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to read secret", error);
        }
    }

    @PluginMethod
    public void secretRemove(PluginCall call) {
        String key = call.getString("key");
        if (key == null) { call.reject("key is required"); return; }
        getSecretPreferences().edit().remove(key).apply();
        call.resolve();
    }

    @PluginMethod
    public void mediaWriteDataUrl(PluginCall call) {
        String dataUrl = call.getString("dataUrl");
        String preferredName = call.getString("preferredName", "");
        if (dataUrl == null || !dataUrl.startsWith("data:")) { call.reject("A data URL is required"); return; }
        try {
            int comma = dataUrl.indexOf(',');
            if (comma < 0) throw new IllegalArgumentException("Invalid data URL");
            String header = dataUrl.substring(5, comma);
            String mimeType = header.split(";")[0];
            byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
            String extension = extensionForMime(mimeType);
            String safeName = sanitizeFileName(preferredName);
            if (safeName.isEmpty()) safeName = UUID.randomUUID().toString();
            if (!safeName.toLowerCase(Locale.ROOT).endsWith(extension)) safeName += extension;
            File mediaDirectory = getMediaDirectory();
            File target = uniqueFile(mediaDirectory, safeName);
            try (OutputStream output = new BufferedOutputStream(new FileOutputStream(target))) {
                output.write(bytes);
            }
            String checksum = sha256(target);
            database.putMedia(
                    UUID.randomUUID().toString(),
                    MEDIA_DIRECTORY + "/" + target.getName(),
                    mimeType,
                    bytes.length,
                    checksum
            );
            JSObject result = new JSObject();
            result.put("uri", Uri.fromFile(target).toString());
            result.put("size", bytes.length);
            result.put("sha256", checksum);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to save media", error);
        }
    }

    @PluginMethod
    public void exportBackup(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/zip");
        String timestamp = new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US).format(new Date());
        intent.putExtra(Intent.EXTRA_TITLE, "roleplay-hub-" + timestamp + ".rphub-backup");
        startActivityForResult(call, intent, "exportBackupResult");
    }

    @ActivityCallback
    private void exportBackupResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) return;
        if (activityResult.getResultCode() != Activity.RESULT_OK || activityResult.getData() == null || activityResult.getData().getData() == null) {
            call.reject("Backup cancelled");
            return;
        }
        Uri uri = activityResult.getData().getData();
        try (OutputStream output = getContext().getContentResolver().openOutputStream(uri)) {
            if (output == null) throw new IOException("Unable to open backup destination");
            createBackup(output);
            JSObject result = new JSObject();
            result.put("uri", uri.toString());
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to create backup", error);
        }
    }

    @PluginMethod
    public void restoreBackup(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        startActivityForResult(call, intent, "restoreBackupResult");
    }

    @ActivityCallback
    private void restoreBackupResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) return;
        if (activityResult.getResultCode() != Activity.RESULT_OK || activityResult.getData() == null || activityResult.getData().getData() == null) {
            call.reject("Restore cancelled");
            return;
        }
        try (InputStream input = getContext().getContentResolver().openInputStream(activityResult.getData().getData())) {
            if (input == null) throw new IOException("Unable to open backup");
            restoreFromBackup(input);
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to restore backup", error);
        }
    }

    private SharedPreferences getSecretPreferences() {
        return getContext().getSharedPreferences(SECRET_PREFERENCES, Context.MODE_PRIVATE);
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        KeyStore.Entry existing = keyStore.getEntry(KEY_ALIAS, null);
        if (existing instanceof KeyStore.SecretKeyEntry) return ((KeyStore.SecretKeyEntry) existing).getSecretKey();
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build());
        return generator.generateKey();
    }

    private String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        return Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + ":" + Base64.encodeToString(encrypted, Base64.NO_WRAP);
    }

    private String decrypt(String value) throws Exception {
        String[] parts = value.split(":", 2);
        if (parts.length != 2) throw new IllegalArgumentException("Invalid encrypted secret");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }

    private File getMediaDirectory() throws IOException {
        File directory = new File(getContext().getFilesDir(), MEDIA_DIRECTORY);
        if (!directory.exists() && !directory.mkdirs()) throw new IOException("Unable to create media directory");
        return directory;
    }

    private void createBackup(OutputStream destination) throws Exception {
        database.checkpoint();
        File databaseFile = getContext().getDatabasePath(RoleplayDatabase.DATABASE_NAME);
        JSONObject hashes = new JSONObject();
        try (ZipOutputStream zip = new ZipOutputStream(new BufferedOutputStream(destination))) {
            hashes.put("database/" + RoleplayDatabase.DATABASE_NAME, addFileToZip(zip, databaseFile, "database/" + RoleplayDatabase.DATABASE_NAME));
            File mediaDirectory = getMediaDirectory();
            addDirectoryToZip(zip, mediaDirectory, "media", hashes);
            JSONObject manifest = new JSONObject();
            manifest.put("format", "roleplay-hub-backup");
            manifest.put("formatVersion", 1);
            manifest.put("databaseVersion", RoleplayDatabase.DATABASE_VERSION);
            manifest.put("createdAt", System.currentTimeMillis());
            manifest.put("device", Settings.Global.getString(getContext().getContentResolver(), Settings.Global.DEVICE_NAME));
            manifest.put("hashes", hashes);
            byte[] manifestBytes = manifest.toString(2).getBytes(StandardCharsets.UTF_8);
            zip.putNextEntry(new ZipEntry("manifest.json"));
            zip.write(manifestBytes);
            zip.closeEntry();
        }
    }

    private String addFileToZip(ZipOutputStream zip, File source, String entryName) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        zip.putNextEntry(new ZipEntry(entryName));
        try (InputStream input = new BufferedInputStream(new FileInputStream(source))) {
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) >= 0) {
                if (count == 0) continue;
                zip.write(buffer, 0, count);
                digest.update(buffer, 0, count);
            }
        }
        zip.closeEntry();
        return toHex(digest.digest());
    }

    private void addDirectoryToZip(ZipOutputStream zip, File directory, String prefix, JSONObject hashes) throws Exception {
        File[] children = directory.listFiles();
        if (children == null) return;
        for (File child : children) {
            String name = prefix + "/" + child.getName();
            if (child.isDirectory()) addDirectoryToZip(zip, child, name, hashes);
            else hashes.put(name, addFileToZip(zip, child, name));
        }
    }

    private void restoreFromBackup(InputStream source) throws Exception {
        File restoreRoot = new File(getContext().getCacheDir(), "restore-" + UUID.randomUUID());
        if (!restoreRoot.mkdirs()) throw new IOException("Unable to create restore directory");
        try {
            extractBackup(source, restoreRoot);
            File manifestFile = new File(restoreRoot, "manifest.json");
            File restoredDatabase = new File(restoreRoot, "database/" + RoleplayDatabase.DATABASE_NAME);
            if (!manifestFile.isFile() || !restoredDatabase.isFile()) throw new IOException("Backup is incomplete");
            JSONObject manifest = new JSONObject(new String(Files.readAllBytes(manifestFile.toPath()), StandardCharsets.UTF_8));
            if (!"roleplay-hub-backup".equals(manifest.optString("format"))) throw new IOException("Unsupported backup format");
            if (manifest.optInt("databaseVersion", 0) > RoleplayDatabase.DATABASE_VERSION) throw new IOException("Backup requires a newer app version");
            verifyHashes(restoreRoot, manifest.getJSONObject("hashes"));
            SQLiteDatabase checkDatabase = SQLiteDatabase.openDatabase(restoredDatabase.getAbsolutePath(), null, SQLiteDatabase.OPEN_READONLY);
            try (Cursor cursor = checkDatabase.rawQuery("PRAGMA quick_check", null)) {
                if (!cursor.moveToFirst() || !"ok".equalsIgnoreCase(cursor.getString(0))) throw new IOException("Backup database failed integrity check");
            } finally {
                checkDatabase.close();
            }
            installRestoredData(restoreRoot, restoredDatabase);
        } finally {
            deleteRecursively(restoreRoot);
        }
    }

    private void extractBackup(InputStream source, File root) throws IOException {
        String rootPath = root.getCanonicalPath() + File.separator;
        try (ZipInputStream zip = new ZipInputStream(new BufferedInputStream(source))) {
            ZipEntry entry;
            byte[] buffer = new byte[64 * 1024];
            while ((entry = zip.getNextEntry()) != null) {
                File target = new File(root, entry.getName());
                if (!target.getCanonicalPath().startsWith(rootPath)) throw new IOException("Unsafe backup path");
                if (entry.isDirectory()) {
                    if (!target.exists() && !target.mkdirs()) throw new IOException("Unable to create restore directory");
                } else {
                    File parent = target.getParentFile();
                    if (parent != null && !parent.exists() && !parent.mkdirs()) throw new IOException("Unable to create restore directory");
                    try (OutputStream output = new BufferedOutputStream(new FileOutputStream(target))) {
                        int count;
                        while ((count = zip.read(buffer)) >= 0) {
                            if (count > 0) output.write(buffer, 0, count);
                        }
                    }
                }
                zip.closeEntry();
            }
        }
    }

    private void verifyHashes(File root, JSONObject hashes) throws Exception {
        Iterator<String> keys = hashes.keys();
        while (keys.hasNext()) {
            String entry = keys.next();
            File file = new File(root, entry);
            if (!file.isFile() || !hashes.getString(entry).equals(sha256(file))) throw new IOException("Backup checksum failed: " + entry);
        }
    }

    private void installRestoredData(File restoreRoot, File restoredDatabase) throws Exception {
        File liveDatabase = getContext().getDatabasePath(RoleplayDatabase.DATABASE_NAME);
        File liveMedia = new File(getContext().getFilesDir(), MEDIA_DIRECTORY);
        File restoredMedia = new File(restoreRoot, MEDIA_DIRECTORY);
        File stagedDatabase = new File(liveDatabase.getParentFile(), RoleplayDatabase.DATABASE_NAME + ".restore");
        File stagedMedia = new File(getContext().getFilesDir(), MEDIA_DIRECTORY + ".restore");
        File previousMedia = new File(getContext().getFilesDir(), MEDIA_DIRECTORY + ".previous");
        File rollbackRoot = new File(getContext().getCacheDir(), "rollback-" + UUID.randomUUID());
        deleteRecursively(stagedDatabase);
        deleteRecursively(stagedMedia);
        deleteRecursively(previousMedia);
        copyFile(restoredDatabase, stagedDatabase);
        if (restoredMedia.exists()) copyDirectory(restoredMedia, stagedMedia);
        else if (!stagedMedia.mkdirs()) throw new IOException("Unable to stage restored media");
        if (!rollbackRoot.mkdirs()) throw new IOException("Unable to create rollback directory");
        database.close();
        try {
            if (liveDatabase.exists()) copyFile(liveDatabase, new File(rollbackRoot, RoleplayDatabase.DATABASE_NAME));
            if (liveMedia.exists()) copyDirectory(liveMedia, new File(rollbackRoot, MEDIA_DIRECTORY));
            removeDatabaseSidecars(liveDatabase);
            moveReplacing(stagedDatabase, liveDatabase);
            if (liveMedia.exists()) moveReplacing(liveMedia, previousMedia);
            moveReplacing(stagedMedia, liveMedia);
            database = new RoleplayDatabase(getContext());
            if (!database.integrityCheck()) throw new IOException("Restored database failed integrity check");
            clearSecretsAfterRestore();
            deleteRecursively(previousMedia);
            deleteRecursively(rollbackRoot);
        } catch (Exception error) {
            database.close();
            File rollbackDatabase = new File(rollbackRoot, RoleplayDatabase.DATABASE_NAME);
            if (rollbackDatabase.exists()) copyFile(rollbackDatabase, liveDatabase);
            deleteRecursively(liveMedia);
            File rollbackMedia = new File(rollbackRoot, MEDIA_DIRECTORY);
            if (rollbackMedia.exists()) copyDirectory(rollbackMedia, liveMedia);
            database = new RoleplayDatabase(getContext());
            deleteRecursively(previousMedia);
            deleteRecursively(rollbackRoot);
            throw error;
        } finally {
            deleteRecursively(stagedDatabase);
            deleteRecursively(stagedMedia);
        }
    }

    private void clearSecretsAfterRestore() throws Exception {
        if (!getSecretPreferences().edit().clear().commit()) {
            throw new IOException("Unable to clear secrets after restore");
        }
        try {
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            if (keyStore.containsAlias(KEY_ALIAS)) keyStore.deleteEntry(KEY_ALIAS);
        } catch (Exception ignored) {
            // Clearing the encrypted values is sufficient; the empty alias can be reused.
        }
    }

    private static void copyFile(File source, File target) throws IOException {
        File parent = target.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) throw new IOException("Unable to create directory");
        Files.copy(source.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING);
    }

    private static void copyDirectory(File source, File target) throws IOException {
        if (!target.exists() && !target.mkdirs()) throw new IOException("Unable to create directory");
        File[] children = source.listFiles();
        if (children == null) return;
        for (File child : children) {
            File destination = new File(target, child.getName());
            if (child.isDirectory()) copyDirectory(child, destination);
            else copyFile(child, destination);
        }
    }

    private static void moveReplacing(File source, File target) throws IOException {
        try {
            Files.move(source.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
        } catch (AtomicMoveNotSupportedException ignored) {
            Files.move(source.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING);
        }
    }

    private static void removeDatabaseSidecars(File databaseFile) {
        new File(databaseFile.getAbsolutePath() + "-wal").delete();
        new File(databaseFile.getAbsolutePath() + "-shm").delete();
    }

    private static void deleteRecursively(File file) {
        if (file == null || !file.exists()) return;
        File[] children = file.listFiles();
        if (children != null) for (File child : children) deleteRecursively(child);
        file.delete();
    }

    private static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new BufferedInputStream(new FileInputStream(file))) {
            byte[] buffer = new byte[64 * 1024];
            int count;
            while ((count = input.read(buffer)) >= 0) if (count > 0) digest.update(buffer, 0, count);
        }
        return toHex(digest.digest());
    }

    private static String toHex(byte[] bytes) {
        StringBuilder output = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) output.append(String.format(Locale.US, "%02x", value));
        return output.toString();
    }

    private static String extensionForMime(String mimeType) {
        if ("image/png".equalsIgnoreCase(mimeType)) return ".png";
        if ("image/webp".equalsIgnoreCase(mimeType)) return ".webp";
        if ("image/gif".equalsIgnoreCase(mimeType)) return ".gif";
        if ("image/jpeg".equalsIgnoreCase(mimeType)) return ".jpg";
        return ".bin";
    }

    private static String sanitizeFileName(String value) {
        return value == null ? "" : value.replaceAll("[^a-zA-Z0-9._-]", "_").replaceAll("^\\.+", "");
    }

    private static File uniqueFile(File directory, String name) {
        File candidate = new File(directory, name);
        if (!candidate.exists()) return candidate;
        int dot = name.lastIndexOf('.');
        String base = dot > 0 ? name.substring(0, dot) : name;
        String extension = dot > 0 ? name.substring(dot) : "";
        return new File(directory, base + "-" + UUID.randomUUID().toString().substring(0, 8) + extension);
    }
}
