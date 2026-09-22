import { meetingRepository } from '../db/database.js';
import { Meeting, createId } from '../db/models.js';
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

/**
 * کلید مرکزی پیام‌رسانی بین content script (تب Meet)، side panel و background.
 * actions: meeting:start, meeting:segment, meeting:end, meeting:generateReport, meeting:sync
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch((err) => sendResponse({ error: err.message }));
  return true; // async response
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
    case 'meeting:sync':
      return onSyncToGithub(message.payload);
    case 'meeting:list':
      return meetingRepository.getAll(message.payload || {});
    case 'meeting:get':
      return meetingRepository.getById(message.payload.id);
    default:
      throw new Error(`Unknown message type: ${message.type}`);
  }
}

async function onMeetingStart({ meetUrl, language }) {
  const settings = await settingsStore.getAll();
  const meeting = new Meeting({
    id: createId(),
    title: 'جلسه ' + new Date().toLocaleString('fa-IR'),
    startedAt: Date.now(),
    meetUrl,
    language: language || settings.defaultLanguage,
  });
  await meetingRepository.save(meeting);
  return meeting;
}

async function onMeetingSegment({ meetingId, segment }) {
  const meeting = await meetingRepository.getById(meetingId);
  if (!meeting) throw new Error('جلسه یافت نشد');
  meeting.segments.push(segment);
  await meetingRepository.save(meeting);
  return { ok: true };
}

async function onMeetingEnd({ meetingId, title }) {
  const meeting = await meetingRepository.getById(meetingId);
  if (!meeting) throw new Error('جلسه یافت نشد');
  meeting.endedAt = Date.now();
  if (title) meeting.title = title;
  await meetingRepository.save(meeting);
  return meeting;
}

async function onGenerateReport({ meetingId, templateId, providerId }) {
  const meeting = await meetingRepository.getById(meetingId);
  if (!meeting) throw new Error('جلسه یافت نشد');
  const report = await meetingSummarizer.generateReport(meeting, { templateId, providerId });
  meeting.report = report;
  await meetingRepository.save(meeting);
  return meeting;
}

async function onSyncToGithub({ meetingId }) {
  const meeting = await meetingRepository.getById(meetingId);
  if (!meeting) throw new Error('جلسه یافت نشد');
  const settings = await settingsStore.getAll();
  if (!settings.github?.enabled) throw new Error('همگام‌سازی GitHub فعال نیست');

  const client = new GitHubSyncClient(settings.github);
  const markdown = new MeetingReportMarkdownBuilder(meeting).build();
  await client.syncMeeting(meeting, markdown);

  meeting.githubSynced = true;
  await meetingRepository.save(meeting);
  return meeting;
}
