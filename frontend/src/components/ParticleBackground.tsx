import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
}

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>();
  const mouseRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Particle colors (orange/purple theme)
    const colors = [
      'rgba(249, 115, 22, 0.8)',   // orange-500
      'rgba(251, 146, 60, 0.7)',   // orange-400
      'rgba(139, 92, 246, 0.6)',   // purple-500
      'rgba(168, 85, 247, 0.5)',   // purple-400
      'rgba(236, 72, 153, 0.5)',   // pink-500
      'rgba(255, 255, 255, 0.4)',  // white
    ];

    // Create initial particles
    const createParticle = (x?: number, y?: number): Particle => {
      const useRandom = x === undefined || y === undefined;
      return {
        x: useRandom ? Math.random() * canvas.width : x,
        y: useRandom ? Math.random() * canvas.height : y,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        size: Math.random() * 3 + 1,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: Math.random() * 0.5 + 0.3,
        decay: 0.001 + Math.random() * 0.002,
      };
    };

    // Initialize particles
    const particleCount = 80;
    particlesRef.current = Array.from({ length: particleCount }, () => createParticle());

    // Mouse move handler
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      
      // Add particles near mouse occasionally
      if (Math.random() > 0.85) {
        particlesRef.current.push(createParticle(
          e.clientX + (Math.random() - 0.5) * 50,
          e.clientY + (Math.random() - 0.5) * 50
        ));
      }
    };
    window.addEventListener('mousemove', handleMouseMove);

    // Animation loop
    const animate = () => {
      ctx.fillStyle = 'rgba(15, 10, 26, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const particles = particlesRef.current;

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        // Update position
        p.x += p.vx;
        p.y += p.vy;

        // Gentle drift toward center
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        p.vx += (centerX - p.x) * 0.00002;
        p.vy += (centerY - p.y) * 0.00002;

        // Mouse repulsion (subtle)
        const dx = p.x - mouseRef.current.x;
        const dy = p.y - mouseRef.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 150) {
          const force = (150 - dist) / 150 * 0.02;
          p.vx += dx / dist * force;
          p.vy += dy / dist * force;
        }

        // Fade out
        p.alpha -= p.decay;

        // Remove dead particles or reset
        if (p.alpha <= 0 || p.x < -50 || p.x > canvas.width + 50 || p.y < -50 || p.y > canvas.height + 50) {
          if (particles.length > particleCount) {
            particles.splice(i, 1);
          } else {
            // Reset particle
            Object.assign(p, createParticle());
          }
          continue;
        }

        // Draw particle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color.replace(/[\d.]+\)$/, `${p.alpha})`);
        ctx.fill();

        // Draw glow
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
        gradient.addColorStop(0, p.color.replace(/[\d.]+\)$/, `${p.alpha * 0.3})`));
        gradient.addColorStop(1, 'transparent');
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Connect nearby particles with lines
        for (let j = i - 1; j >= 0; j--) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 100) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            const lineAlpha = (1 - distance / 100) * 0.15 * Math.min(p.alpha, p2.alpha);
            ctx.strokeStyle = `rgba(249, 115, 22, ${lineAlpha})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    // Start animation
    animate();

    // Cleanup
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0 pointer-events-none"
      style={{ background: 'transparent' }}
    />
  );
}

