import { supabase } from './supabase';

const quranAsrUrl = import.meta.env.VITE_QURAN_ASR_URL?.trim() ?? '';
const quranAsrModel = import.meta.env.VITE_QURAN_ASR_MODEL?.trim() ?? '';

export const isQuranAsrConfigured = Boolean(quranAsrUrl && quranAsrModel);

export interface RecitationContext {
  surahNumber: number;
  ayahNumber: number;
}

export async function requestQuranTranscription(
  audio: Blob,
  accessToken: string,
  context: RecitationContext,
  endpoint = quranAsrUrl,
  model = quranAsrModel,
): Promise<string> {
  if (!endpoint || !model) {
    throw new Error('خدمة Whisper القرآنية غير مهيأة. أضف عنوان الخادم واسم النموذج إلى الإعدادات.');
  }
  if (!accessToken) {
    throw new Error('انتهت جلسة الدخول. سجّل الدخول مجددًا ثم أعد المحاولة.');
  }
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new Error('عنوان خادم Whisper غير صالح. تحقق من VITE_QURAN_ASR_URL.');
  }
  if (
    !['https:', 'http:'].includes(parsedEndpoint.protocol) ||
    (parsedEndpoint.protocol === 'http:' &&
      !['localhost', '127.0.0.1', '[::1]'].includes(parsedEndpoint.hostname))
  ) {
    throw new Error('يجب أن يستخدم خادم Whisper اتصال HTTPS.');
  }

  const body = new FormData();
  const extension = audio.type.includes('mp4') ? 'mp4' : audio.type.includes('ogg') ? 'ogg' : 'webm';
  body.append('file', audio, `recitation.${extension}`);
  body.append('model', model);
  body.append('language', 'ar');
  body.append('response_format', 'json');
  body.append('surah_number', String(context.surahNumber));
  body.append('ayah_number', String(context.ayahNumber));

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
    redirect: 'error',
  });
  if (!response.ok) {
    throw new Error(`تعذر تحليل التلاوة (HTTP ${response.status}). تحقق من خدمة Whisper وحاول مجددًا.`);
  }

  const payload: unknown = await response.json();
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('text' in payload) ||
    typeof payload.text !== 'string' ||
    !payload.text.trim()
  ) {
    throw new Error('أعادت خدمة Whisper نتيجة غير صالحة. يجب أن يحتوي الرد على نص التلاوة.');
  }
  return payload.text.trim();
}

export async function transcribeQuranRecitation(
  audio: Blob,
  context: RecitationContext,
): Promise<string> {
  if (!supabase) {
    throw new Error('يتطلب محرك Whisper تسجيل الدخول إلى Supabase.');
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error) throw error;
  if (!session) {
    throw new Error('انتهت جلسة الدخول. سجّل الدخول مجددًا ثم أعد المحاولة.');
  }

  return requestQuranTranscription(audio, session.access_token, context);
}
