import { useEffect, useRef } from 'react';

export interface SandboxOp {
  op: 'move' | 'rotate' | 'scale' | 'color' | 'spawn' | 'destroy';
  name?: string;
  type?: string;
  color?: string;
  x?: number;
  y?: number;
  z?: number;
}

interface Props {
  /** Increment to re-run the script from scratch. */
  runId: number;
  running: boolean;
  script: string;
  onOp: (op: SandboxOp) => void;
  onLog: (text: string, level: 'info' | 'error') => void;
}

/**
 * User-authored game logic runs inside a sandboxed iframe (`allow-scripts`
 * without `allow-same-origin`): it has an opaque origin, no DOM access to the
 * app, no cookies/localStorage, and can only talk to the host through a
 * whitelisted postMessage operation set.
 */
const RUNTIME = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;height:0;overflow:hidden;background:transparent}</style></head><body>
<script>
(function(){
  var listeners={start:[],tick:[]};
  function post(msg){ msg.__nexus=true; parent.postMessage(msg,'*'); }
  var NEXUS={
    onStart:function(fn){ if(typeof fn==='function') listeners.start.push(fn); },
    onTick:function(fn){ if(typeof fn==='function') listeners.tick.push(fn); },
    move:function(name,x,y,z){ post({op:'move',name:String(name),x:+x,y:+y,z:+z}); },
    rotate:function(name,x,y,z){ post({op:'rotate',name:String(name),x:+x,y:+y,z:+z}); },
    scale:function(name,x,y,z){ post({op:'scale',name:String(name),x:+x,y:+y,z:+z}); },
    color:function(name,hex){ post({op:'color',name:String(name),color:String(hex)}); },
    spawn:function(type,name,x,y,z,color){ post({op:'spawn',type:String(type),name:String(name),x:+x,y:+y,z:+z,color:String(color||'#22D3EE')}); },
    destroy:function(name){ post({op:'destroy',name:String(name)}); },
    log:function(){ post({op:'log',text:Array.prototype.slice.call(arguments).map(String).join(' ')}); }
  };
  window.onerror=function(msg){ post({op:'log',level:'error',text:'Script error: '+msg}); return true; };
  window.addEventListener('message',function(e){
    var d=e.data||{};
    if(d.__nexusHost==='init'){
      try{ (new Function('NEXUS', d.script))(NEXUS); }
      catch(err){ post({op:'log',level:'error',text:'Script error: '+(err&&err.message?err.message:err)}); }
      try{ listeners.start.forEach(function(fn){ fn(); }); }
      catch(err){ post({op:'log',level:'error',text:'onStart error: '+(err&&err.message?err.message:err)}); }
      post({op:'log',text:'Sandbox ready — script running in an isolated frame.'});
    } else if(d.__nexusHost==='tick'){
      try{ listeners.tick.forEach(function(fn){ fn(d.dt,d.t); }); }
      catch(err){ post({op:'log',level:'error',text:'onTick error: '+(err&&err.message?err.message:err)}); }
    }
  });
})();
</script></body></html>`;

export function ScriptSandbox({ runId, running, script, onOp, onLog }: Props) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const onOpRef = useRef(onOp);
  const onLogRef = useRef(onLog);
  const lastErrorRef = useRef<{ text: string; at: number }>({ text: '', at: 0 });

  onOpRef.current = onOp;
  onLogRef.current = onLog;

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      const data: any = event.data;
      if (!data || data.__nexus !== true) return;
      if (data.op === 'log') {
        const text = String(data.text ?? '').slice(0, 300);
        const now = Date.now();
        // Collapse repeated runtime errors so a broken tick cannot flood the UI.
        if (data.level === 'error' && lastErrorRef.current.text === text && now - lastErrorRef.current.at < 4000) return;
        lastErrorRef.current = { text, at: now };
        onLogRef.current(text, data.level === 'error' ? 'error' : 'info');
        return;
      }
      if (typeof data.op === 'string') onOpRef.current(data as SandboxOp);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const frame = frameRef.current;
      frame?.contentWindow?.postMessage({ __nexusHost: 'tick', dt, t: now / 1000 }, '*');
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, runId]);

  if (!running) return null;

  return (
    <iframe
      key={runId}
      ref={frameRef}
      title="NEXUS script sandbox"
      sandbox="allow-scripts"
      srcDoc={RUNTIME}
      onLoad={() => {
        frameRef.current?.contentWindow?.postMessage({ __nexusHost: 'init', script }, '*');
      }}
      className="pointer-events-none absolute h-0 w-0 opacity-0"
      aria-hidden="true"
    />
  );
}
