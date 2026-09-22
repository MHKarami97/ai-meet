import { meetingDatabase } from '../db/database.js';
import { Meeting } from '../db/models.js';
import { meetingSummarizer } from './summarizer.js';
import { settingsStore } from './settings-store.js';
import { GitHubSyncClient } from './github-sync.js';
import { MeetingReportMarkdownBuilder } from '../export/markdown-builder.js';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus?.removeAll?.();
});

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch((err) => sendResponse({ error: err.message }));
  return true;
});

async function handleMessage(message) {
  switch (message.type) {
    case 'meeting:start':
      return onMeetingStart(message.payload);
    case 'meeting:segment':
      return onMeetingSegment(message.payload);
    case 'meeting:end':
      return onMeetingEnd(message.payload);
    case 'meeting:generateReport':
      return onGenerateReport(message.payload);
    case 'meeting:buildManualPrompt':
      return onBuildManualPrompt(message.payload);
    case 'meeting:importManualReport':
      return onImportManualReport(message.payload);
    case 'meeting:sync':
      return onSyncToGithub(message.payload);
    case 'meeting:list':
      return meetingDatabase.listMeetings();
    case 'meeting:search':
      return meetingDatabase.searchMeetings(message.payload?.query || '');
    case 'meeting:get':
      return meetingDatabase.getMeeting(message.payload.id);
    case 'meeting:delete':
      return meetingDatabase.deleteMeeting(message.payload.id).then(() => ({ ok: true }));
    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

async function onMeetingStart({ meetUrl, language }) {
  const settings = await settingsStore.getAll();
  const meeting = new Meeting({
    title: `جلسه ${new Date().toLocaleString('fa-IR')}`,
    meetUrl,
    startedAt: new Date().toISOString(),
    language: language || settings.defaultLanguage
  });
  await meetingDatabase.saveMeeting(meeting);
  return meeting;
}

async function onMeetingSegment({ meetingId, segment }) {
  const meeting = await meetingDatabase.getMeeting(meetingId);
  if (!meeting) throw new Error('جلسه پیدا نشد.');
  meeting.segments.push(segment);
  await meetingDatabase.saveMeeting(meeting);
  return { ok: true };
}

async function onMeetingEnd({ meetingId, title }) {
  const meeting = await meetingDatabase.getMeeting(meetingId);
  if (!meeting) throw new Error('جلسه پیدا نشد.');
  meeting.endedAt = new Date().toISOString();
  meeting.status = 'ended';
  if (title) meeting.title = title;
  await meetingDatabase.saveMeeting(meeting);
  return meeting;
}

async function onGenerateReport({ meetingId, templateId, providerId }) {
  const meeting = await meetingDatabase.getMeeting(meetingId);
  if (!meeting) throw new Error('جلسه پیدا نشد.');
  meeting.status = 'summarizing';
  await meetingDatabase.saveMeeting(meeting);
  try {
    meeting.report = await meetingSummarizer.generateReport(meeting, templateId, providerId);
    meeting.status = 'summarized';
  } catch (err) {
    meeting.status = 'failed';
    await meetingDatabase.saveMeeting(meeting);
    throw err;
  }
  await meetingDatabase.saveMeeting(meeting);
  return meeting;
}

async function onBuildManualPrompt({ meetingId, templateId }) {
  const meeting = await meetingDatabase.getMeeting(meetingId);
  if (!meeting) throw new Error('جلسه پیدا نشد.');
  const { template, prompt } = await meetingSummarizer.buildManualPrompt(meeting, templateId);
  return { templateId: template.id, templateName: template.name, prompt };
}

async function onImportManualReport({ meetingId, templateId, rawText }) {
  const meeting = await meetingDatabase.getMeeting(meetingId);
  if (!meeting) throw new Error('جلسه پیدا نشد.');
  meeting.report = await meetingSummarizer.importManualReport(meeting, templateId, rawText);
  meeting.status = 'summarized';
  await meetingDatabase.saveMeeting(meeting);
  return meeting;
}

async function onSyncToGithub({ meetingId }) {
  const meeting = await meetingDatabase.getMeeting(meetingId);
  if (!meeting) throw new Error('جلسه پیدا نشد.');
  const settings = await settingsStore.getAll();
  if (!settings.github?.enabled) throw new Error('همگام‌سازی با GitHub در تنظیمات فعال نیست.');

  const client = new GitHubSyncClient(settings.github);
  const markdown = new MeetingReportMarkdownBuilder(meeting).build();
  await client.syncMeeting(meeting, markdown);
  meeting.syncedToGithub = true;
  await meetingDatabase.saveMeeting(meeting);
  return meeting;
}
