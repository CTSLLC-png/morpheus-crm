const KEY='melrah-field-outbox-v1'
export function pending(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return []}}
export function enqueue(item){const q=pending();q.push({...item,id:crypto.randomUUID(),queuedAt:new Date().toISOString()});localStorage.setItem(KEY,JSON.stringify(q));return q.length}
export async function flush(handler){const q=pending(),left=[];for(const item of q){try{await handler(item)}catch{left.push(item)}}localStorage.setItem(KEY,JSON.stringify(left));return left.length}
export function cacheRoute(rows){localStorage.setItem('melrah-field-route-v1',JSON.stringify(rows))}
export function cachedRoute(){try{return JSON.parse(localStorage.getItem('melrah-field-route-v1')||'[]')}catch{return []}}
