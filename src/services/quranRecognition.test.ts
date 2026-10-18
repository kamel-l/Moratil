import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestQuranTranscription } from './quranRecognition';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Quran Whisper transcription requests', () => {
  it('sends authenticated audio with the ayah context and returns recognized text', async () => {
    const fetchMock = vi.fn(
      async (..._args: Parameters<typeof fetch>) =>
        new Response(JSON.stringify({ text: ' بِسْمِ اللَّهِ ' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const audio = new Blob(['sample audio'], { type: 'audio/webm' });
    const transcript = await requestQuranTranscription(
      audio,
      'user-access-token',
      { surahNumber: 1, ayahNumber: 1 },
      'https://whisper.example.test/v1/audio/transcriptions',
      'quran-whisper-v2',
    );

    expect(transcript).toBe('بِسْمِ اللَّهِ');
    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.headers).toEqual({ Authorization: 'Bearer user-access-token' });
    expect(request?.redirect).toBe('error');
    expect(request?.body).toBeInstanceOf(FormData);
    const formData = request?.body as FormData;
    expect(formData.get('model')).toBe('quran-whisper-v2');
    expect(formData.get('language')).toBe('ar');
    expect(formData.get('surah_number')).toBe('1');
    expect(formData.get('ayah_number')).toBe('1');
    expect(formData.get('file')).toBeInstanceOf(Blob);
  });

  it('rejects insecure remote endpoints before sending the access token', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      requestQuranTranscription(
        new Blob(['sample']),
        'token',
        { surahNumber: 1, ayahNumber: 1 },
        'http://whisper.example.test/transcribe',
        'quran-whisper',
      ),
    ).rejects.toThrow('HTTPS');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed transcription responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ transcript: 'recognized' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );

    await expect(
      requestQuranTranscription(
        new Blob(['sample']),
        'token',
        { surahNumber: 1, ayahNumber: 1 },
        'https://whisper.example.test/transcribe',
        'quran-whisper',
      ),
    ).rejects.toThrow('نتيجة غير صالحة');
  });
});
