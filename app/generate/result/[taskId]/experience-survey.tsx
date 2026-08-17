'use client';

const ratingOptions = [
  { value: 1, label: '完全不符合' },
  { value: 2, label: '不太符合' },
  { value: 3, label: '一般' },
  { value: 4, label: '比较符合' },
  { value: 5, label: '非常符合' },
] as const;

interface ExperienceSurveyProps {
  rating: number | null;
  submitted: boolean;
  submitting: boolean;
  onRatingChange: (rating: number) => void;
  onSubmit: () => void;
  onLater: () => void;
}

export default function ExperienceSurvey({
  rating,
  submitted,
  submitting,
  onRatingChange,
  onSubmit,
  onLater,
}: ExperienceSurveyProps) {
  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="experience-survey-title"
      className="fixed inset-x-3 bottom-[calc(.75rem+env(safe-area-inset-bottom))] z-40 isolate max-h-[calc(100dvh-1.5rem)] overflow-hidden overflow-y-auto rounded-[30px] border border-white/90 bg-gradient-to-b from-white/95 via-[#fbfdfb]/95 to-[#edf5f1]/95 p-5 shadow-[0_30px_90px_rgba(31,64,60,.22)] backdrop-blur-xl sm:inset-x-auto sm:left-1/2 sm:w-[34rem] sm:-translate-x-1/2 sm:p-7 xl:sticky xl:inset-auto xl:top-6 xl:min-h-[36rem] xl:w-auto xl:translate-x-0 xl:self-start xl:p-8"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full border border-[#c8ddd5] opacity-80" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full border-[26px] border-[#eef4f1]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 bottom-0 h-52 w-52 rounded-full bg-[#e5efea]/60 blur-3xl" />

      <button
        type="button"
        onClick={onLater}
        aria-label="关闭反馈卡片，稍后填写"
        className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-[#e6f0ec] text-xl font-light text-[#66847b] transition hover:rotate-6 hover:bg-[#dbe9e3] sm:right-6 sm:top-6"
      >
        <span aria-hidden="true">×</span>
      </button>

      <div className="relative text-center">
        <div aria-hidden="true" className="relative mx-auto mt-1 grid h-[5.25rem] w-[5.25rem] place-items-center rounded-full border-[7px] border-white bg-[#f2ead9] shadow-[0_12px_30px_rgba(62,101,89,.16)]">
          <div className="grid h-[3.65rem] w-[3.65rem] place-items-center rounded-full border-[5px] border-[#93b8aa] bg-[#eadabe]">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-[#dd735f] text-lg font-semibold text-white shadow-inner">♪</div>
          </div>
          <span className="absolute -right-3 top-0 -rotate-12 text-xl text-[#dd735f]">♫</span>
        </div>
        <p className="mt-5 text-xs font-semibold tracking-[0.22em] text-[#638d80]">听完这一口</p>
      </div>

      <form
        className="relative mt-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <fieldset>
          <legend id="experience-survey-title" className="w-full text-center font-serif text-[1.75rem] font-medium leading-[1.25] tracking-[-0.03em] text-[#285e55] sm:text-[2.15rem]">
            <span className="block">这段音乐符合我的</span>
            <span className="block">饮食体验？</span>
          </legend>
          <p className="mt-3 text-center text-xs leading-5 text-[#8a9d97]">没听完也没关系，按此刻的感受作答</p>
          <div className="mt-5 grid grid-cols-5 gap-1.5 sm:gap-2">
            {ratingOptions.map((option) => {
              const active = rating === option.value;
              return (
                <label key={option.value} className="cursor-pointer text-center">
                  <input
                    type="radio"
                    name="experience-rating"
                    value={option.value}
                    checked={active}
                    onChange={() => onRatingChange(option.value)}
                    className="peer sr-only"
                  />
                  <span
                    className={`flex min-h-[5.6rem] flex-col items-center justify-center rounded-[18px] border px-1 py-2 transition peer-focus-visible:ring-2 peer-focus-visible:ring-[#dd735f] peer-focus-visible:ring-offset-2 sm:min-h-[6.7rem] ${
                      active
                        ? 'border-[#86aa9e] bg-[#dceae5] text-[#285e55] shadow-[0_10px_24px_rgba(62,101,89,.14)]'
                        : 'border-[#cfdfd9] bg-white/70 text-[#67827a] hover:-translate-y-0.5 hover:border-[#9dbbb1] hover:bg-white'
                    }`}
                  >
                    <span className="font-serif text-2xl font-semibold leading-none sm:text-[1.7rem]">{option.value}</span>
                    <span className="mt-2 text-[9px] leading-3 sm:text-[11px] sm:leading-4">{option.label}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="mx-auto mt-5 grid max-w-sm grid-cols-2 gap-3 sm:mt-7">
          <button
            type="button"
            onClick={onLater}
            className="h-12 rounded-2xl border border-[#c9dcd5] bg-white/70 px-4 text-sm font-semibold text-[#647f77] transition hover:bg-white hover:text-[#285e55]"
          >
            稍后再说
          </button>
          <button
            type="submit"
            disabled={rating === null || submitting}
            className="h-12 rounded-2xl bg-[#79a99b] px-4 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(62,101,89,.18)] transition hover:bg-[#65998a] disabled:cursor-not-allowed disabled:bg-[#a9c8be] disabled:shadow-none"
          >
            {submitting ? '提交中…' : submitted ? '更新感受' : '提交感受'}
          </button>
        </div>
      </form>
    </div>
  );
}
