package com.roleplayhub.app;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteDoneException;
import android.database.sqlite.SQLiteOpenHelper;
import android.database.sqlite.SQLiteStatement;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class RoleplayDatabase extends SQLiteOpenHelper {
    static final String DATABASE_NAME = "roleplay_hub.db";
    static final int DATABASE_VERSION = 1;

    RoleplayDatabase(Context context) {
        super(context, DATABASE_NAME, null, DATABASE_VERSION);
        setWriteAheadLoggingEnabled(true);
    }

    @Override
    public void onConfigure(SQLiteDatabase database) {
        super.onConfigure(database);
        database.setForeignKeyConstraintsEnabled(true);
        database.rawQuery("PRAGMA synchronous=NORMAL", null).close();
    }

    @Override
    public void onCreate(SQLiteDatabase database) {
        database.execSQL("CREATE TABLE kv_store (key TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL, updated_at INTEGER NOT NULL)");
        database.execSQL("CREATE TABLE chat_messages (character_id TEXT NOT NULL, message_id TEXT NOT NULL, position INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'final', message_json TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(character_id, message_id))");
        database.execSQL("CREATE INDEX idx_chat_character_position ON chat_messages(character_id, position)");
        database.execSQL("CREATE TABLE media (id TEXT PRIMARY KEY NOT NULL, relative_path TEXT NOT NULL UNIQUE, mime_type TEXT, byte_size INTEGER NOT NULL DEFAULT 0, sha256 TEXT, created_at INTEGER NOT NULL)");
        database.execSQL("CREATE TABLE app_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)");
        database.execSQL("INSERT INTO app_meta(key, value) VALUES('schema_version', '1')");
    }

    @Override
    public void onUpgrade(SQLiteDatabase database, int oldVersion, int newVersion) {
        // Future migrations are applied incrementally here.
    }

    void putValue(String key, String json) {
        ContentValues values = new ContentValues();
        values.put("key", key);
        values.put("json", json);
        values.put("updated_at", System.currentTimeMillis());
        getWritableDatabase().insertWithOnConflict("kv_store", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    String getValue(String key) {
        // 用 SQLiteStatement.simpleQueryForString() 直接读取值，绕过 CursorWindow 的单行大小限制。
        // 角色等大 JSON（可达 1MB+）通过 Cursor 读取时会抛 SQLiteBlobTooBigException
        // （"Row too big to fit into CursorWindow"），导致 JS 侧 loadData 失败、
        // 随后 saveData 用默认空值覆盖恢复的数据。
        SQLiteStatement statement = getReadableDatabase().compileStatement("SELECT json FROM kv_store WHERE key = ?");
        try {
            statement.bindString(1, key);
            return statement.simpleQueryForString();
        } catch (SQLiteDoneException noRow) {
            return null;
        } finally {
            statement.close();
        }
    }

    void removeValue(String key) {
        getWritableDatabase().delete("kv_store", "key = ?", new String[]{key});
    }

    JSONArray getChat(String characterId) throws JSONException {
        JSONArray result = new JSONArray();
        try (Cursor cursor = getReadableDatabase().query(
                "chat_messages", new String[]{"message_json", "status"}, "character_id = ?",
                new String[]{characterId}, null, null, "position ASC")) {
            while (cursor.moveToNext()) {
                JSONObject message = new JSONObject(cursor.getString(0));
                message.put("storageStatus", cursor.getString(1));
                result.put(message);
            }
        }
        return result;
    }

    void applyChatChanges(String characterId, JSONObject changes) throws JSONException {
        SQLiteDatabase database = getWritableDatabase();
        database.beginTransaction();
        try {
            JSONArray deletes = changes.optJSONArray("deletes");
            if (deletes != null) {
                for (int index = 0; index < deletes.length(); index++) {
                    database.delete("chat_messages", "character_id = ? AND message_id = ?", new String[]{characterId, deletes.getString(index)});
                }
            }
            JSONArray upserts = changes.optJSONArray("upserts");
            if (upserts != null) {
                for (int index = 0; index < upserts.length(); index++) {
                    JSONObject item = upserts.getJSONObject(index);
                    putMessage(database, characterId, item.getInt("position"), item.getJSONObject("message"));
                }
            }
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
    }

    void replaceChat(String characterId, JSONArray messages) throws JSONException {
        SQLiteDatabase database = getWritableDatabase();
        database.beginTransaction();
        try {
            database.delete("chat_messages", "character_id = ?", new String[]{characterId});
            for (int position = 0; position < messages.length(); position++) {
                putMessage(database, characterId, position, messages.getJSONObject(position));
            }
            database.setTransactionSuccessful();
        } finally {
            database.endTransaction();
        }
    }

    void deleteChat(String characterId) {
        getWritableDatabase().delete("chat_messages", "character_id = ?", new String[]{characterId});
    }

    void putMedia(String id, String relativePath, String mimeType, long byteSize, String sha256) {
        ContentValues values = new ContentValues();
        values.put("id", id);
        values.put("relative_path", relativePath);
        values.put("mime_type", mimeType);
        values.put("byte_size", byteSize);
        values.put("sha256", sha256);
        values.put("created_at", System.currentTimeMillis());
        getWritableDatabase().insertWithOnConflict("media", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    private void putMessage(SQLiteDatabase database, String characterId, int position, JSONObject message) throws JSONException {
        String messageId = message.optString("id", "");
        if (messageId.isEmpty()) throw new JSONException("Message id is required");
        ContentValues values = new ContentValues();
        values.put("character_id", characterId);
        values.put("message_id", messageId);
        values.put("position", position);
        values.put("status", message.optString("storageStatus", "final"));
        values.put("message_json", message.toString());
        values.put("updated_at", System.currentTimeMillis());
        database.insertWithOnConflict("chat_messages", null, values, SQLiteDatabase.CONFLICT_REPLACE);
    }

    void checkpoint() {
        getWritableDatabase().rawQuery("PRAGMA wal_checkpoint(FULL)", null).close();
    }

    boolean integrityCheck() {
        try (Cursor cursor = getReadableDatabase().rawQuery("PRAGMA quick_check", null)) {
            return cursor.moveToFirst() && "ok".equalsIgnoreCase(cursor.getString(0));
        }
    }
}
