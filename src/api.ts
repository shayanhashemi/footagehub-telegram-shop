export async function api<T>(route:string,init?:RequestInit):Promise<T>{
 const response=await fetch(`/api${route}`,{credentials:'same-origin',...init,headers:{...(init?.body?{'Content-Type':'application/json'}:{}),...init?.headers}});
 let data:unknown;try{data=await response.json();}catch{throw new Error('پاسخ سرور قابل خواندن نیست.');}
 if(!response.ok)throw new Error((data as {error?:string})?.error||`HTTP ${response.status}`);
 return data as T;
}
export const send=<T,>(route:string,method:string,data?:unknown)=>api<T>(route,{method,body:data===undefined?undefined:JSON.stringify(data)});
export const displayDate=(date:string|null)=>date?new Intl.DateTimeFormat('fa-IR',{dateStyle:'medium',timeStyle:'short'}).format(new Date(date)):'—';
