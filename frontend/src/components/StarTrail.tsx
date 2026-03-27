import React, { useEffect, useRef } from 'react';

export function StarTrail() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let lastTime = 0;
    
    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      // Throttle star creation
      if (now - lastTime < 40) return;
      lastTime = now;
      
      if (!containerRef.current) return;

      const star = document.createElement('div');
      const size = Math.random() * 2 + 1; // 1px to 3px (fainter/smaller)
      
      star.className = 'absolute rounded-full bg-sky-100/60 shadow-[0_0_6px_1px_rgba(125,211,252,0.4)] animate-star-fade pointer-events-none';
      star.style.left = `${e.clientX - size / 2}px`;
      star.style.top = `${e.clientY - size / 2}px`;
      star.style.width = `${size}px`;
      star.style.height = `${size}px`;
      
      containerRef.current.appendChild(star);
      
      // Remove star after animation completes
      setTimeout(() => {
        if (star.parentNode === containerRef.current) {
          containerRef.current.removeChild(star);
        }
      }, 800);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <div 
      ref={containerRef} 
      className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden"
    />
  );
}
