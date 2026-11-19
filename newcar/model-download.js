const buffers = new Map();
const chunkSize = 384 * 1024;

async function readPart(url, start, end, signal, progress) {
  const requestURL = new URL(url);
  requestURL.searchParams.set('part', start);
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    const controller = new AbortController();
    const cancel = () => controller.abort(signal.reason);
    signal.addEventListener('abort', cancel, {once:true});
    let timer;
    const heartbeat = () => {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(new Error('下载长时间没有响应')), 18000);
    };
    try {
      heartbeat();
      // Some intermediaries reject Range. Retry the initial request as a plain GET.
      const headers = attempt && start === 0 ? {} : {Range:'bytes='+start+'-'+end};
      const response = await fetch(requestURL, {
        signal: controller.signal, headers,
        cache:attempt ? 'reload' : 'default'
      });
      if (!response.ok) throw new Error('HTTP '+response.status);
      const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range'));
      if (response.status === 206 && (!range || +range[1] !== start || +range[2] !== Math.min(end,+range[3]-1))) {
        throw new Error('分段数据不完整');
      }
      const total = range ? +range[3] : Number(response.headers.get('Content-Length'));
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      for (;;) {
        const {done,value} = await reader.read();
        if (done) break;
        heartbeat();
        chunks.push(value);
        size += value.byteLength;
        progress(size,total);
      }
      if (range && size !== +range[2]-start+1) throw new Error('分段数据不完整');
      const bytes = new Uint8Array(size);
      let offset=0;
      for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length; }
      return {bytes,total,partial:response.status===206};
    } catch (error) {
      controller.abort();
      signal.throwIfAborted();
      if (attempt) throw error;
      progress(0,0);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort',cancel);
    }
  }
}

// Four requests at most. Plain static servers may answer the first Range with a full 200.
export async function downloadModel(url, signal, report) {
  if (buffers.has(url.href)) return buffers.get(url.href);
  const counts = new Map();
  const part = (start,end) => readPart(url,start,end,signal,(bytes,total)=>{
    counts.set(start,bytes);
    if (total) report([...counts.values()].reduce((a,b)=>a+b,0),total);
  });
  const first = await part(0,chunkSize-1);
  let data = first.bytes;
  if (first.partial && first.bytes.length < first.total) {
    data = new Uint8Array(first.total);
    data.set(first.bytes);
    let next = first.bytes.length;
    async function worker() {
      while (next < first.total) {
        const start = next;
        next += chunkSize;
        const rest = await part(start,Math.min(first.total,next)-1);
        if (!rest.partial || rest.total !== first.total) throw new Error('模型分段响应异常');
        data.set(rest.bytes,start);
      }
    }
    await Promise.all(Array.from({length:Math.min(4,Math.ceil((first.total-next)/chunkSize))},worker));
  }
  if (data.length < 20 || new DataView(data.buffer).getUint32(8,true) !== data.length ||
      String.fromCharCode(...data.subarray(0,4)) !== 'glTF') throw new Error('下载的模型不完整');
  buffers.set(url.href,data.buffer);
  return data.buffer;
}
