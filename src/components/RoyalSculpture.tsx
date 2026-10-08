import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer } from "@react-three/drei";
import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { Group } from "three";
import { Crown } from "lucide-react";

function SculptureFallback() {
  return <div className="flex h-full items-center justify-center text-primary-foreground"><Crown className="h-20 w-20" strokeWidth={1} /></div>;
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() { return this.state.failed ? <SculptureFallback /> : this.props.children; }
}

function Sculpture({ reduced, blue, pink, pearl }: { reduced: boolean; blue: string; pink: string; pearl: string }) {
  const gem = useRef<Group>(null);
  const ringA = useRef<Group>(null);
  const ringB = useRef<Group>(null);
  const orbs = useRef<Group>(null);
  const phase = useRef(0);
  useFrame(({ pointer }, rawDelta) => {
    if (reduced) return;
    const dt = Math.min(rawDelta, 0.05);
    phase.current += dt;
    const t = phase.current;
    if (gem.current) {
      gem.current.rotation.y = Math.sin(t * 0.6) * 0.55 + pointer.x * 0.2;
      gem.current.rotation.x += (0.2 + pointer.y * 0.16 - gem.current.rotation.x) * (1 - Math.exp(-3 * dt));
      gem.current.rotation.z += (pointer.x * 0.1 - gem.current.rotation.z) * (1 - Math.exp(-3 * dt));
      gem.current.position.y = Math.sin(t * 0.9) * 0.07;
    }
    if (ringA.current) ringA.current.rotation.y += dt * 0.42;
    if (ringB.current) ringB.current.rotation.y -= dt * 0.26;
    if (orbs.current) {
      orbs.current.rotation.y += dt * 0.5;
      orbs.current.rotation.x = Math.sin(t * 0.45) * 0.18;
    }
  });
  return <>
    <ambientLight intensity={0.95} />
    <directionalLight position={[3, 4, 5]} intensity={2.6} color={pearl} />
    <directionalLight position={[-3, -1, 2]} intensity={1.9} color={pink} />
    <Environment resolution={128}>
      <Lightformer intensity={5} position={[0, 4, 3]} scale={[6, 3, 1]} color={pearl} />
      <Lightformer intensity={3} position={[-4, 0, 2]} rotation-y={Math.PI / 2} scale={[4, 4, 1]} color={blue} />
      <Lightformer intensity={3} position={[4, 0, 1]} rotation-y={-Math.PI / 2} scale={[4, 4, 1]} color={pink} />
      <Lightformer intensity={2.2} position={[0, -4, 2]} scale={[6, 3, 1]} color={pink} />
      <Lightformer intensity={2.4} position={[0, 1, 6]} scale={[8, 4, 1]} color={pearl} />
      <Lightformer intensity={2} position={[0, 2, -6]} rotation-y={Math.PI} scale={[8, 4, 1]} color={blue} />
    </Environment>

    {/* Low-poly lion head: layered mane, long face, broad muzzle */}
    <group ref={gem} rotation={[0.1, 0, 0]} scale={0.88}>
      {[0, 1, 2].map((layer) => Array.from({ length: 16 - layer * 3 }, (_, i) => {
        const n = 16 - layer * 3;
        const a = (i / n) * Math.PI * 2 + layer * 0.25;
        const r = 0.95 - layer * 0.2;
        const c = (i + layer) % 3 === 0 ? blue : pink;
        return <mesh key={`m${layer}-${i}`} position={[Math.cos(a) * r, Math.sin(a) * r * 1.08 - 0.05, -0.45 + layer * 0.18]} rotation={[0, 0, a - Math.PI / 2]}>
          <coneGeometry args={[0.34 - layer * 0.04, 0.8 - layer * 0.15, 4]} />
          <meshStandardMaterial color={c} metalness={0.45} roughness={0.2} emissive={c} emissiveIntensity={0.28} flatShading />
        </mesh>;
      }))}
      {/* mane disc behind the face */}
      <mesh position={[0, -0.05, -0.35]} scale={[0.95, 1.05, 0.4]}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color={pink} metalness={0.4} roughness={0.25} emissive={pink} emissiveIntensity={0.25} flatShading />
      </mesh>
      {/* ears */}
      {[-1, 1].map((s) => <group key={`e${s}`} position={[s * 0.44, 0.5, 0.05]} rotation={[0, 0, -s * 0.35]}>
        <mesh scale={[1, 1, 0.5]}><sphereGeometry args={[0.17, 6, 4]} /><meshStandardMaterial color={pearl} roughness={0.3} flatShading /></mesh>
        <mesh position={[0, 0, 0.07]} scale={[0.6, 0.6, 0.3]}><sphereGeometry args={[0.17, 6, 4]} /><meshStandardMaterial color={pink} roughness={0.3} flatShading /></mesh>
      </group>)}
      {/* face: tapered, longer than wide */}
      <mesh position={[0, 0.02, 0.1]} scale={[0.5, 0.62, 0.48]}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color={pearl} metalness={0.25} roughness={0.3} flatShading />
      </mesh>
      {/* brow ridge */}
      <mesh position={[0, 0.26, 0.48]} scale={[0.4, 0.08, 0.15]}>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={pearl} metalness={0.25} roughness={0.3} flatShading />
      </mesh>
      {/* eyes */}
      {[-1, 1].map((s) => <mesh key={`y${s}`} position={[s * 0.19, 0.17, 0.54]} rotation={[0, 0, s * 0.3]} scale={[1.3, 0.6, 0.5]}>
        <sphereGeometry args={[0.07, 12, 10]} />
        <meshStandardMaterial color="#1c2350" metalness={0.5} roughness={0.1} />
      </mesh>)}
      {/* nose bridge */}
      <mesh position={[0, -0.02, 0.56]} scale={[0.12, 0.26, 0.12]}>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={pearl} metalness={0.25} roughness={0.3} flatShading />
      </mesh>
      {/* muzzle cheeks */}
      {[-1, 1].map((s) => <mesh key={`c${s}`} position={[s * 0.13, -0.3, 0.5]} scale={[0.17, 0.14, 0.15]}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial color={pearl} metalness={0.2} roughness={0.35} flatShading />
      </mesh>)}
      {/* nose */}
      <mesh position={[0, -0.2, 0.66]} rotation={[Math.PI / 2 + 0.4, 0, Math.PI]}>
        <coneGeometry args={[0.11, 0.12, 3]} />
        <meshStandardMaterial color="#1c2350" metalness={0.5} roughness={0.15} flatShading />
      </mesh>
      {/* chin */}
      <mesh position={[0, -0.48, 0.38]} scale={[0.14, 0.09, 0.12]}>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={pink} roughness={0.3} flatShading />
      </mesh>
    </group>

    <group ref={ringA} rotation={[1.18, 0, 0]}>
      <mesh>
        <torusGeometry args={[1.36, 0.022, 10, 96]} />
        <meshStandardMaterial color={pink} metalness={0.7} roughness={0.28} />
      </mesh>
    </group>
    <group ref={ringB} rotation={[1.45, 0, 0.5]}>
      <mesh>
        <torusGeometry args={[1.18, 0.014, 8, 96]} />
        <meshStandardMaterial color={blue} metalness={0.7} roughness={0.3} />
      </mesh>
    </group>

    <group ref={orbs}>
      <mesh position={[1.24, 0.1, 0]}>
        <sphereGeometry args={[0.085, 20, 20]} />
        <meshStandardMaterial color={pink} metalness={0.6} roughness={0.15} emissive={pink} emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[-1.05, 0.62, 0.45]}>
        <sphereGeometry args={[0.06, 18, 18]} />
        <meshStandardMaterial color={blue} metalness={0.6} roughness={0.15} emissive={blue} emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0.38, -0.95, -0.7]}>
        <sphereGeometry args={[0.05, 16, 16]} />
        <meshStandardMaterial color={pearl} metalness={0.6} roughness={0.15} emissive={pearl} emissiveIntensity={0.45} />
      </mesh>
    </group>
  </>;
}

export default function RoyalSculpture() {
  const container = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [palette, setPalette] = useState<{ blue: string; pink: string; pearl: string }>();
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    setPalette({ blue: css.getPropertyValue("--sculpture-blue").trim(), pink: css.getPropertyValue("--sculpture-pink").trim(), pearl: css.getPropertyValue("--sculpture-pearl").trim() });
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updateMotion = () => setReduced(media.matches);
    updateMotion();
    media.addEventListener("change", updateMotion);
    let visible = true;
    const updateActive = () => setActive(visible && !document.hidden);
    const observer = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? false; updateActive(); });
    if (container.current) observer.observe(container.current);
    document.addEventListener("visibilitychange", updateActive);
    return () => { observer.disconnect(); media.removeEventListener("change", updateMotion); document.removeEventListener("visibilitychange", updateActive); };
  }, []);
  return <div ref={container} className="royal-sculpture" role="img" aria-label="Royal Good — নীল–গোলাপি 3D রত্ন">
    <SceneBoundary>
      {palette ? <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 5.8], fov: 36 }} frameloop={active && !reduced ? "always" : "demand"} gl={{ alpha: true, antialias: true }} fallback={<SculptureFallback />}>
        <Suspense fallback={null}><Sculpture reduced={reduced} {...palette} /></Suspense>
      </Canvas> : <SculptureFallback />}
    </SceneBoundary>
  </div>;
}