import React, { useEffect, useRef, useState, useCallback } from "react";

interface IntroAnimationProps {
  onComplete: () => void;
}

const LETTERS = "Ledgerly".split("");

const STYLES = `
  .lg-intro {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: #ffffff;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    pointer-events: all;
  }

  /* Fade the whole overlay out */
  @keyframes lg-overlay-out {
    0%   { opacity: 1; }
    100% { opacity: 0; }
  }
  .lg-intro.lg-out {
    animation: lg-overlay-out 0.3s cubic-bezier(0.4, 0, 1, 1) forwards;
    pointer-events: none;
  }

  /* Each letter drops in from slightly above and fades in */
  @keyframes lg-letter-in {
    0%   { opacity: 0; transform: translateY(-14px); }
    100% { opacity: 1; transform: translateY(0); }
  }

  /* After all letters land, tagline fades up */
  @keyframes lg-tag-in {
    0%   { opacity: 0; transform: translateY(6px); }
    100% { opacity: 0.45; transform: translateY(0); }
  }

  /* Thin underline grows left→right under the word */
  @keyframes lg-line-grow {
    0%   { width: 0; opacity: 0; }
    100% { width: 100%; opacity: 1; }
  }

  .lg-word {
    display: flex;
    flex-direction: row;
    align-items: baseline;
    position: relative;
    padding-bottom: 6px;
  }

  .lg-letter {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    font-size: clamp(2.8rem, 8vw, 5.5rem);
    font-weight: 700;
    letter-spacing: -0.035em;
    color: #0f172a;
    opacity: 0;
    display: inline-block;
    animation: lg-letter-in 0.23s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }

  .lg-underline {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 2px;
    background: #2563eb;
    border-radius: 2px;
    width: 0;
    opacity: 0;
  }
  .lg-underline.lg-line-animate {
    animation: lg-line-grow 0.25s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }

  .lg-tagline {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    font-size: clamp(0.7rem, 1.8vw, 0.85rem);
    font-weight: 400;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #0f172a;
    opacity: 0;
    margin-top: 18px;
  }
  .lg-tagline.lg-tag-show {
    animation: lg-tag-in 0.28s ease forwards;
  }

  /* Skip button */
  .lg-skip-btn {
    position: absolute;
    bottom: 28px;
    right: 28px;
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 0.68rem;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #94a3b8;
    background: transparent;
    border: 1px solid #e2e8f0;
    padding: 6px 14px;
    border-radius: 100px;
    cursor: pointer;
    transition: color 0.18s, border-color 0.18s;
    opacity: 0;
    animation: lg-tag-in 0.28s ease 0.33s forwards;
  }
  .lg-skip-btn:hover {
    color: #475569;
    border-color: #cbd5e1;
  }
`;

// stagger: each letter starts 40ms after the previous
const LETTER_DELAY_MS = 40;
// underline starts after last letter lands
const UNDERLINE_DELAY_MS = LETTERS.length * LETTER_DELAY_MS + 90;
// tagline after underline
const TAGLINE_DELAY_MS = UNDERLINE_DELAY_MS + 130;
// auto-exit after everything settles
const AUTO_EXIT_MS = TAGLINE_DELAY_MS + 380;

const IntroAnimation: React.FC<IntroAnimationProps> = ({ onComplete }) => {
  const [exiting, setExiting] = useState(false);
  const [showLine, setShowLine] = useState(false);
  const [showTag, setShowTag] = useState(false);
  const doneRef = useRef(false);

  const exit = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    setExiting(true);
    setTimeout(onComplete, 300); // match lg-overlay-out duration
  }, [onComplete]);

  useEffect(() => {
    const t1 = setTimeout(() => setShowLine(true), UNDERLINE_DELAY_MS);
    const t2 = setTimeout(() => setShowTag(true), TAGLINE_DELAY_MS);
    const t3 = setTimeout(exit, AUTO_EXIT_MS);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [exit]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div className={`lg-intro${exiting ? " lg-out" : ""}`} aria-hidden="true">

        <div className="lg-word">
          {LETTERS.map((char, i) => (
            <span
              key={i}
              className="lg-letter"
              style={{ animationDelay: `${i * LETTER_DELAY_MS}ms` }}
            >
              {char}
            </span>
          ))}
          <div className={`lg-underline${showLine ? " lg-line-animate" : ""}`} />
        </div>

        <p className={`lg-tagline${showTag ? " lg-tag-show" : ""}`}>
          Expense reconciliation platform
        </p>

        <button className="lg-skip-btn" onClick={exit} aria-label="Skip intro">
          Skip
        </button>
      </div>
    </>
  );
};

export default IntroAnimation;
