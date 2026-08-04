import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readPublicMusicShare } from '@/lib/generatedMusicStore';

export const dynamic = 'force-dynamic';

type SharePageProps = { params: Promise<{ shareId: string }> };

const formatDuration = (seconds: number) => {
  if (!seconds || Number.isNaN(seconds)) return '--:--';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
};

export async function generateMetadata({ params }: SharePageProps): Promise<Metadata> {
  const { shareId } = await params;
  const share = await readPublicMusicShare(shareId);
  if (!share) return { title: '分享的歌曲不存在 | EchoTaste' };

  return {
    title: `${share.title} | EchoTaste`,
    description: share.tags || '来听听这首由 EchoTaste 生成的音乐。',
  };
}

export default async function SharePage({ params }: SharePageProps) {
  const { shareId } = await params;
  const share = await readPublicMusicShare(shareId);
  if (!share) notFound();

  const mediaBase = `/api/share/${encodeURIComponent(share.shareId)}/media`;

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-4 py-8 text-slate-950 sm:py-14">
      <article className="mx-auto max-w-3xl overflow-hidden rounded-[32px] border border-white/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
        <div className="grid md:grid-cols-[300px_minmax(0,1fr)]">
          <div className="relative aspect-square bg-gradient-to-br from-teal-100 via-rose-50 to-white md:aspect-auto md:min-h-[420px]">
            {share.imagePath ? (
              <Image
                src={`${mediaBase}?kind=image`}
                alt={`${share.title} 封面`}
                fill
                priority
                unoptimized
                sizes="(min-width: 768px) 300px, 100vw"
                className="object-cover"
              />
            ) : (
              <div className="grid h-full min-h-72 place-items-center">
                <div className="h-28 w-28 rounded-full border-[18px] border-teal-300 border-t-rose-300" />
              </div>
            )}
          </div>

          <div className="flex flex-col justify-center p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">EchoTaste Music</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">{share.title}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">{share.tags || 'AI 生成音乐'}</p>
            <p className="mt-2 font-mono text-xs text-slate-400">时长 {formatDuration(share.duration)}</p>

            <audio className="mt-7 w-full" controls preload="metadata" src={`${mediaBase}?kind=audio`}>
              您的浏览器不支持音频播放。
            </audio>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={`${mediaBase}?kind=audio&download=1`}
                className="rounded-full bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
              >
                下载歌曲
              </a>
              <Link
                href="/generate"
                className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                我也要生成
              </Link>
            </div>
          </div>
        </div>
      </article>
    </main>
  );
}
