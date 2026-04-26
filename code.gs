// ============================================================
// wumpuskey
// Misskeyのチャンネルに投稿されたノートを直近100件の中からランダムに選出し、画像付きノートのURLを任意のDiscordチャンネルへ投稿するBot
// 
// Copyright (c) 2026 千紗みかん
// 
// This software is released under the MIT License.
// https://github.com/chisamikan/wumpuskey/blob/main/LICENSE
// ============================================================

// ------------------------------------------------------------
// スクリプトプロパティ（GASプロジェクト設定から登録）
//   DISCORD_WEBHOOK_URL : DiscordのWebhook URL
//   MISSKEY_SERVER_URL : MisskeyサーバーのURL
//   MISSKEY_CHANNEL_ID  : MisskeyのチャンネルID
// ------------------------------------------------------------

const PROPS = PropertiesService.getScriptProperties();
const DISCORD_WEBHOOK_URL = PROPS.getProperty('DISCORD_WEBHOOK_URL');
const MISSKEY_SERVER_URL = PROPS.getProperty('MISSKEY_SERVER_URL');
const MISSKEY_CHANNEL_ID = PROPS.getProperty('MISSKEY_CHANNEL_ID');

// テキストに含まれていた場合に除外するキーワード
const EXCLUDE_KEYWORDS = ['ゆるぼ', '募集', '宣伝', '告知', 'PR'];


// ============================================================
// メイン処理
// トリガーから呼び出す関数
// ============================================================
function postRandomNote() {
  const postedUrls = getPostedUrls();
  const lastUserId = getLastPostedUserId();
  const notes = fetchChannelNotes();

  if (!notes || notes.length === 0) {
    console.log('ノートを取得できませんでした');
    return;
  }

  const filtered = filterNotes(notes, postedUrls, lastUserId);

  if (filtered.length === 0) {
    console.log('投稿できるノートがありませんでした');
    return;
  }

  // フィルタリング済みのノートからランダムに1件選択
  const note = filtered[Math.floor(Math.random() * filtered.length)];
  const noteUrl = `${MISSKEY_SERVER_URL}/notes/${note.id}`;

  postToDiscord(noteUrl);
  savePostedUrl(noteUrl, note.userId);
  console.log(`投稿完了: ${noteUrl}`);
}


// ============================================================
// Misskey API
// ============================================================

// チャンネルのタイムラインから最新100件を取得する
function fetchChannelNotes() {
  const url = `${MISSKEY_SERVER_URL}/api/channels/timeline`;
  const payload = {
    channelId: MISSKEY_CHANNEL_ID,
    limit: 100,
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const data = JSON.parse(response.getContentText());

    if (!Array.isArray(data)) {
      console.error('APIレスポンスが不正です:', response.getContentText());
      return [];
    }

    return data;
  } catch (e) {
    console.error('API取得エラー:', e);
    return [];
  }
}


// ============================================================
// フィルタリング
// ============================================================

// 投稿するノートの条件を満たすものだけに絞り込む
function filterNotes(notes, postedUrls, lastUserId) {
  return notes.filter(note => {

    // リノートを除外
    if (note.renoteId) return false;

    // 返信を除外
    if (note.replyId) return false;

    // メンション（@）を含むノートを除外
    if (note.text && note.text.includes('@')) return false;

    // URLを含むノートを除外
    if (note.text && /https?:\/\//.test(note.text)) return false;

    // 画像添付がないノートを除外（動画のみも除外）
    const hasImage = note.files && note.files.some(f => f.type.startsWith('image/'));
    if (!hasImage) return false;

    // 除外キーワードを含むノートを除外
    if (note.text) {
      const hasExcludedKeyword = EXCLUDE_KEYWORDS.some(keyword => note.text.includes(keyword));
      if (hasExcludedKeyword) return false;
    }

    // 既にDiscordへ投稿済みのノートを除外
    const noteUrl = `${MISSKEY_SERVER_URL}/notes/${note.id}`;
    if (postedUrls.has(noteUrl)) return false;

    // 直前に投稿したユーザーと同じユーザーのノートを除外
    if (lastUserId && note.userId === lastUserId) return false;

    return true;
  });
}


// ============================================================
// Discord投稿
// ============================================================

// Webhook経由でノートのURLをDiscordに投稿する
function postToDiscord(noteUrl) {
  const payload = { content: noteUrl };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  const response = UrlFetchApp.fetch(DISCORD_WEBHOOK_URL, options);
  console.log(`Discord投稿レスポンス: ${response.getResponseCode()}`);
}


// ============================================================
// スプレッドシート（投稿済み管理）
// ============================================================

// 投稿済みURLの一覧をSetで返す
function getPostedUrls() {
  const sheet = getSheet();
  const data = sheet.getDataRange().getValues();
  const urls = new Set();

  // 1行目はヘッダーのためスキップ
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) urls.add(data[i][0]);
  }

  return urls;
}

// 最後に投稿したノートのユーザーIDを返す（連続投稿防止用）
function getLastPostedUserId() {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();

  // データが1行もない（ヘッダーのみ）場合はnullを返す
  if (lastRow <= 1) return null;

  return sheet.getRange(lastRow, 3).getValue() || null;
}

// 投稿済みURLとユーザーIDをスプレッドシートに記録する
function savePostedUrl(url, userId) {
  const sheet = getSheet();
  sheet.appendRow([url, new Date().toLocaleString('ja-JP'), userId]);
}

// postedシートを取得する（存在しない場合は新規作成して初期化）
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('posted');

  if (!sheet) {
    sheet = ss.insertSheet('posted');
    sheet.appendRow(['URL', '投稿日時', 'ユーザーID']);
    sheet.setFrozenRows(1);
  }

  return sheet;
}
