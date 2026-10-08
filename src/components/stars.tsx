"use client";

const PATH = "M12 2.8l2.8 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17l-5.7 3.1 1.2-6.3L2.9 9.4l6.3-.8z";

function Star({ fill, size }: { fill: number; size: number }) {
  // fill: 0 ~ 1 (반 별은 0.5)
  return (
    <span className="relative inline-block" style={{ width: size, height: size }}>
      <svg viewBox="0 0 24 24" width={size} height={size} className="absolute inset-0 text-line">
        <path d={PATH} fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
        <svg viewBox="0 0 24 24" width={size} height={size} className="text-[#ffc24b]">
          <path d={PATH} fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
      </span>
    </span>
  );
}

/** 별점 보여주기 (0.5 단위) */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-px" aria-label={`별 ${value}개`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} fill={Math.max(0, Math.min(1, value - n + 1))} />
      ))}
    </span>
  );
}

/** 별점 매기기: 별의 왼쪽 반을 누르면 반 개, 오른쪽을 누르면 한 개. 같은 값을 다시 누르면 취소 */
export function StarInput({ value, onChange, size = 36 }: { value: number; onChange: (v: number) => void; size?: number }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="별점">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className="press relative">
          <Star size={size} fill={Math.max(0, Math.min(1, value - n + 1))} />
          <button
            type="button"
            aria-label={`별 ${n - 0.5}개`}
            onClick={() => onChange(value === n - 0.5 ? 0 : n - 0.5)}
            className="absolute inset-y-0 left-0 w-1/2"
          />
          <button
            type="button"
            aria-label={`별 ${n}개`}
            onClick={() => onChange(value === n ? 0 : n)}
            className="absolute inset-y-0 right-0 w-1/2"
          />
        </span>
      ))}
    </div>
  );
}
