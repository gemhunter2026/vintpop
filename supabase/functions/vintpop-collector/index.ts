import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";

const WALLAPOP_API = "https://api.wallapop.com/api/v3";
const TYPESAFE_API = "https://api.typesafe.ai/v1/systemone";
const GOOGLE_VISION_API = "https://vision.googleapis.com/v1/images:annotate";
const MAX_PRICE = 100;
const MAX_NEW_PER_RUN = 20;
const MAX_GOOGLE_PER_RUN = 8;

const SEARCH_TERMS = ["antiguo","antigua","lámpara antigua","lampara antigua","silla antigua","sillón antiguo","mueble antiguo","viejo","vieja","retro","años 60","años 70","space age"];
const FURNITURE_WORDS = ["silla","sillon","sillón","mesa","lampara","lámpara","mueble","sofa","sofá","aparador","estanteria","estantería","espejo","taburete","butaca","chair","lamp","armchair","table","cabinet","shelf","vitrina","comoda","cómoda"];
const EXPERT_WORDS = ["vintage","mid century","mid-century","space age","diseño","designer","original","años 60","años 70","1960","1970","italian","italiano","scandinavian","escandinavo","modelo","model","marca","brand","edición","edition","artemide","flos","kartell","cassina","vitra","knoll","thonet","guzzini","panton","eames","breuer","rinaldi","colombo","castiglioni","mobili","murano","bauhaus"];
const COLLECTIBLE_TERMS = ["space age","mid century","mid-century","vintage","1960","1970","designer","design","italian","scandinavian","guzzini","artemide","flos","kartell","cassina","vitra","knoll","thonet","panton","eames","breuer","rinaldi","colombo","castiglioni","murano","postmodern","brutalist","bauhaus","atomic","mushroom lamp","chrome"];
const VALUABLE_DOMAINS = ["1stdibs.com","selency.fr","selency.co.uk","pamono.eu","pamono.com","chairish.com","catawiki.com","design-market.eu","design-market.fr","whoppah.com","vntg.com","bonhams.com","sothebys.com","christies.com","wright20.com","lot-art.com","incollect.com"];

type SearchItem = { id:string; title?:string; description?:string; price?:{amount?:number;currency?:string}; location?:{city?:string}; images?:Array<{urls?:{small?:string;medium?:string;big?:string}}>; user_id?:string; web_slug?:string; created_at?:number|string; modified_at?:number|string; category_id?:number; };

function normalize(value: unknown) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim(); }
function clamp01(value:number) { return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)); }
function n(value:unknown, fallback=0) { return typeof value === "number" && Number.isFinite(value) ? value : fallback; }
function toIso(value:unknown):string|null {
  if (!value) return null;
  if (typeof value === "string") { const parsed=Date.parse(value); return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null; }
  if (typeof value === "number") { const ms=value < 10_000_000_000 ? value*1000 : value; const d=new Date(ms); return Number.isNaN(d.getTime()) ? null : d.toISOString(); }
  return null;
}
function itemUrl(item:SearchItem) { return item.web_slug ? `https://es.wallapop.com/item/${item.web_slug}` : `https://es.wallapop.com/item/${item.id}`; }
function imageUrls(item:SearchItem) { return (item.images ?? []).map((img)=>img?.urls?.medium || img?.urls?.big || img?.urls?.small).filter((url):url is string=>Boolean(url)); }

async function fetchJson(url:string, init:RequestInit={}, timeoutMs=12000) {
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(), timeoutMs);
  try { const response=await fetch(url,{...init,signal:controller.signal}); const text=await response.text(); if(!response.ok) throw new Error(`${response.status} ${url}: ${text.slice(0,260)}`); return text ? JSON.parse(text) : {}; }
  finally { clearTimeout(timer); }
}
async function wallapop(path:string, params?:Record<string,string|number|undefined>) {
  const url=new URL(`${WALLAPOP_API}${path}`);
  for(const [key,value] of Object.entries(params ?? {})) if(value!==undefined && value!=="") url.searchParams.set(key,String(value));
  return fetchJson(url.toString(),{headers:{"X-DeviceOS":"0"}});
}
function extractItems(payload:any):SearchItem[] {
  const candidates=[payload?.data?.section?.payload?.items,payload?.data?.section?.items,payload?.data?.items,payload?.items,payload?.data];
  for(const candidate of candidates) if(Array.isArray(candidate)) return candidate.filter((x)=>x && typeof x==="object");
  return [];
}
function findHomeCategory(payload:any):number|undefined {
  const roots=Array.isArray(payload?.categories)?payload.categories:Array.isArray(payload)?payload:[];
  const walk=(nodes:any[]):number|undefined=>{ for(const node of nodes){ const name=normalize(node?.name); if(name.includes("hogar")&&(name.includes("jardin")||name.includes("decor"))) return Number(node.id); const nested=walk(Array.isArray(node?.subcategories)?node.subcategories:[]); if(nested) return nested; } return undefined; };
  return walk(roots);
}
async function searchAll() {
  let categoryId:number|undefined;
  try { categoryId=findHomeCategory(await wallapop("/categories")); } catch { categoryId=undefined; }
  const found=new Map<string,{item:SearchItem;queries:Set<string>}>();
  for(const term of SEARCH_TERMS) {
    const data=await wallapop("/search",{step:1,source:"keywords",limit:20,keywords:term,max_sale_price:MAX_PRICE,order_by:"newest",category_id:categoryId});
    for(const item of extractItems(data)) {
      const price=n(item?.price?.amount,999999); if(!item?.id || price>MAX_PRICE) continue;
      const existing=found.get(item.id); if(existing) existing.queries.add(term); else found.set(item.id,{item,queries:new Set([term])});
    }
  }
  return found;
}
function hasAny(text:string, words:string[]) { const value=normalize(text); return words.some((word)=>value.includes(normalize(word))); }
function sellerStatsSummary(stats:any) {
  const ratings=Array.isArray(stats?.ratings)?stats.ratings:[]; const counters=Array.isArray(stats?.counters)?stats.counters:[];
  let rating:number|null=null; let reviews:number|null=null;
  for(const x of ratings){ const value=Number(x?.value); if(!Number.isFinite(value)) continue; if(rating==null || (value<=5 && value>rating)) rating=value; }
  for(const x of counters){ const label=normalize(x?.type); const value=Number(x?.value); if(!Number.isFinite(value)) continue; if(label.includes("review")||label.includes("rating")||label.includes("valor")) reviews=Math.max(reviews??0,value); }
  return {rating,reviews};
}
async function enrichSeller(userId:string|undefined, cache:Map<string,any>) {
  if(!userId) return null; if(cache.has(userId)) return cache.get(userId);
  try {
    const [profile,stats,itemsPayload]=await Promise.all([wallapop(`/users/${userId}`),wallapop(`/users/${userId}/stats`),wallapop(`/users/${userId}/items`,{limit:40})]);
    const activeItems=extractItems(itemsPayload).slice(0,40);
    const furniture=activeItems.filter((x)=>hasAny(`${x.title??""} ${x.description??""}`,FURNITURE_WORDS));
    const expert=activeItems.filter((x)=>hasAny(`${x.title??""} ${x.description??""}`,EXPERT_WORDS));
    const parsed=sellerStatsSummary(stats);
    const summary={id:userId,name:profile?.micro_name??profile?.name??null,type:profile?.type??null,badge:profile?.badge_type??null,featured:Boolean(profile?.featured),registerDate:toIso(profile?.register_date),activeCount:activeItems.length,furnitureCount:furniture.length,expertVocabularyCount:expert.length,rating:parsed.rating,reviewCount:parsed.reviews,sampleListings:activeItems.slice(0,12).map((x)=>({title:x.title??"",price:n(x?.price?.amount,0)}))};
    cache.set(userId,summary); return summary;
  } catch(error) { const summary={id:userId,error:String(error)}; cache.set(userId,summary); return summary; }
}
async function jev(apiKey:string,state:any,questions:any,idempotencyKey:string) {
  let lastError:unknown;
  for(let attempt=0;attempt<2;attempt++){ try { return await fetchJson(TYPESAFE_API,{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json","Idempotency-Key":idempotencyKey},body:JSON.stringify({model:"jev-latest",state,questions})},20000); } catch(error){ lastError=error; if(attempt===0) await new Promise((resolve)=>setTimeout(resolve,650)); } }
  throw lastError;
}
function noul(result:any,key:string,fallback=.5){ return clamp01(n(result?.answers?.[key]?.noul,fallback)); }
function score01(result:any,key:string,maxIndex:number){ return clamp01(n(result?.answers?.[key]?.score,maxIndex/2)/maxIndex); }
function profileLooksProfessional(seller:any){ const type=normalize(seller?.type), badge=normalize(seller?.badge); return type.includes("professional")||type.includes("business")||badge.includes("pro")||seller?.featured===true; }
function deterministicKnowledgeSignal(item:SearchItem,seller:any){ const text=`${item.title??""} ${item.description??""}`; const explicit=hasAny(text,EXPERT_WORDS); const ratio=seller?.activeCount?n(seller.expertVocabularyCount)/seller.activeCount:0; return clamp01((explicit?.55:0)+ratio*.45+(profileLooksProfessional(seller)?.35:0)); }

async function preClassify(apiKey:string,item:SearchItem,matchedQueries:string[],seller:any){
  const price=n(item?.price?.amount,0);
  const state={listing:{title:item.title??"",description:item.description??"",price_eur:price,matched_searches:matchedQueries,city:item.location?.city??null},seller:seller??{unavailable:true},deterministic:{title_or_description_contains_design_vocabulary:hasAny(`${item.title??""} ${item.description??""}`,EXPERT_WORDS),seller_knowledge_signal:deterministicKnowledgeSignal(item,seller),professional_profile_signal:profileLooksProfessional(seller)},objective:"Find under-100-euro furniture, lighting or decor where the seller may not know it is collectible vintage/designer design. Favor recall: uncertain but visually promising objects should proceed to visual checking."};
  const questions={
    relevant_object:{type:"noul",instructions:"Is this plausibly a furniture, lighting, decor or design object relevant to a vintage-design bargain hunter?"},
    vintage_signal:{type:"noul",instructions:"Do the listing and seller context plausibly suggest a genuinely older or 1950s-1980s design object rather than an obviously recent generic product?"},
    seller_knowledgeable:{type:"noul",instructions:"Does the seller appear knowledgeable or specialized enough in vintage/designer furniture that they are likely to know what this object is worth?"},
    seller_unaware:{type:"noul",instructions:"Is it plausible the seller does not know the designer, model, collectibility or true market value of this object?"},
    explicitly_identified:{type:"noul",instructions:"Does the listing explicitly identify a meaningful brand, designer, exact model, edition or other specialist information that indicates the seller has researched the object?"},
    worth_visual_check:{type:"noul",instructions:"Given the low asking price and seller/text signals, is this listing worth spending a visual web-identification lookup on, even if the object might later prove generic?"},
    item_type:{type:"choice",instructions:"What broad object type best fits the listing?",criteria:{lamp:"Lamp or lighting",chair:"Dining or side chair",armchair:"Armchair, lounge chair or seating",table:"Table or desk",storage:"Cabinet, shelving, sideboard or storage furniture",decor:"Mirror, decorative object or accessory",other:"Other or unclear"}},
    opportunity:{type:"score",instructions:"Rate how strongly the non-visual evidence justifies further visual investigation for a possible undervalued vintage/design find.",criteria:["No useful opportunity signal","Weak signal; likely generic","Uncertain but worth considering","Good bargain-hunting signal","Very strong mismatch between object context, seller knowledge and low price"]}
  };
  const result=await jev(apiKey,state,questions,`vintpop-pre-${item.id}`);
  const relevant=noul(result,"relevant_object"), vintage=noul(result,"vintage_signal"), sellerUnaware=noul(result,"seller_unaware"), worthVisual=noul(result,"worth_visual_check"), sellerKnow=noul(result,"seller_knowledgeable"), explicit=noul(result,"explicitly_identified"), opportunity=score01(result,"opportunity",4), priceSignal=clamp01((MAX_PRICE-price)/MAX_PRICE+.25);
  let preScore=relevant*.14+vintage*.2+sellerUnaware*.25+worthVisual*.24+opportunity*.1+priceSignal*.07-sellerKnow*.11-explicit*.08; if(profileLooksProfessional(seller)) preScore-=.12;
  return {result,preScore:clamp01(preScore)};
}
function bytesToBase64(bytes:Uint8Array){ let binary=""; const chunk=0x8000; for(let i=0;i<bytes.length;i+=chunk) binary+=String.fromCharCode(...bytes.subarray(i,Math.min(bytes.length,i+chunk))); return btoa(binary); }
async function googleWebDetection(apiKey:string,imageUrl:string){
  const imageResponse=await fetch(imageUrl,{signal:AbortSignal.timeout(12000)}); if(!imageResponse.ok) throw new Error(`Image fetch ${imageResponse.status}`);
  const bytes=new Uint8Array(await imageResponse.arrayBuffer()); if(bytes.byteLength>7_500_000) throw new Error("Image too large for MVP visual check");
  const response=await fetchJson(`${GOOGLE_VISION_API}?key=${encodeURIComponent(apiKey)}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requests:[{image:{content:bytesToBase64(bytes)},features:[{type:"WEB_DETECTION",maxResults:12}]}]})},25000);
  const web=response?.responses?.[0]?.webDetection??{};
  const entities=(web.webEntities??[]).slice(0,12).map((x:any)=>({description:x.description??"",score:n(x.score)}));
  const pages=(web.pagesWithMatchingImages??[]).slice(0,12).map((x:any)=>({url:x.url??"",title:x.pageTitle??"",score:n(x.score)}));
  const labels=(web.bestGuessLabels??[]).slice(0,5).map((x:any)=>x.label??"");
  const fullMatches=(web.fullMatchingImages??[]).slice(0,6).map((x:any)=>x.url??"");
  const partialMatches=(web.partialMatchingImages??[]).slice(0,6).map((x:any)=>x.url??"");
  const similar=(web.visuallySimilarImages??[]).slice(0,6).map((x:any)=>x.url??"");
  const combined=normalize([labels.join(" "),entities.map((x:any)=>x.description).join(" "),pages.map((x:any)=>x.title).join(" ")].join(" "));
  const collectibleHits=COLLECTIBLE_TERMS.filter((term)=>combined.includes(normalize(term)));
  const valuablePages=pages.filter((page:any)=>VALUABLE_DOMAINS.some((domain)=>String(page.url).includes(domain)));
  const maxEntity=entities.reduce((m:number,x:any)=>Math.max(m,n(x.score)),0), domainScore=clamp01(valuablePages.length/3), termScore=clamp01(collectibleHits.length/4), matchScore=clamp01((fullMatches.length*1.5+partialMatches.length*.5)/5);
  return {summary:{labels,entities,pages,fullMatches,partialMatches,similar,valuablePages,collectibleHits},visualScore:clamp01(maxEntity*.32+domainScore*.3+termScore*.23+matchScore*.15)};
}
async function finalClassify(apiKey:string,item:SearchItem,seller:any,preResult:any,preScore:number,google:any){
  const state={listing:{title:item.title??"",description:item.description??"",price_eur:n(item?.price?.amount)},seller,pre_analysis:{pre_score:preScore,answers:preResult?.answers??{}},google_web_detection:google.summary,visual_signal_score:google.visualScore,objective:"Decide whether this under-100-euro listing is plausibly an undervalued collectible vintage/designer object worth immediate manual review. Google matches can be merely similar; do not assume a high dealer asking price proves identity or value."};
  const questions={
    collectible_vintage:{type:"noul",instructions:"Considering the web-image evidence plus listing context, is the object plausibly a collectible or design-relevant vintage piece rather than generic old furniture?"},
    likely_underpriced:{type:"noul",instructions:"Is there meaningful evidence that the asking price is materially below the object's plausible market value? Account for uncertainty in visual identity and the seller's knowledge."},
    web_matches_useful:{type:"noul",instructions:"Are the Google web matches specific and relevant enough to help identify this object or a close design family, rather than generic visually similar noise?"},
    manual_review:{type:"noul",instructions:"Should a human vintage hunter open this Wallapop listing now for closer inspection? Favor recall when the upside could be large."},
    final_opportunity:{type:"score",instructions:"Rate the overall bargain opportunity after combining price, seller sophistication, text and web-image evidence.",criteria:["Not an opportunity","Weak; probably not worth opening","Interesting uncertainty; manual review reasonable","Strong candidate with meaningful upside","Exceptional candidate; review immediately"]}
  };
  const result=await jev(apiKey,state,questions,`vintpop-final-${item.id}`);
  const collectible=noul(result,"collectible_vintage"), underpriced=noul(result,"likely_underpriced"), manual=noul(result,"manual_review"), finalOpportunity=score01(result,"final_opportunity",4);
  return {result,candidateScore:clamp01(preScore*.2+google.visualScore*.18+collectible*.23+underpriced*.24+manual*.1+finalOpportunity*.05)};
}
function publicRow(item:SearchItem,queries:string[],seller:any){
  const images=imageUrls(item);
  return {id:item.id,url:itemUrl(item),title:item.title||"Sin título",description:item.description||null,price:n(item?.price?.amount),currency:item?.price?.currency||"EUR",image_url:images[0]||null,images,location_city:item.location?.city||null,category_id:item.category_id??null,seller_id:item.user_id||null,seller_name:seller?.name||null,seller_type:seller?.type||null,seller_badge:seller?.badge||null,seller_rating:seller?.rating??null,seller_review_count:seller?.reviewCount??null,seller_active_count:seller?.activeCount??null,seller_furniture_count:seller?.furnitureCount??null,seller_summary:seller,matched_queries:queries,wallapop_created_at:toIso(item.created_at),last_analyzed_at:new Date().toISOString()};
}
function getAdminClient(){
  const url=Deno.env.get("SUPABASE_URL")!; let key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  try { const keys=JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")||"{}"); key=keys.default||key; } catch {}
  if(!url||!key) throw new Error("Supabase admin credentials unavailable in Edge Function runtime");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST") return Response.json({error:"POST only"},{status:405});
  const startedAt=new Date().toISOString(); let body:any={}; try{body=await req.json();}catch{}
  const dryRun=body?.dryRun===true, googleApiKey=String(body?.googleApiKey||""), typesafeApiKey=String(body?.typesafeApiKey||"");
  if(!dryRun&&(!googleApiKey||!typesafeApiKey)) return Response.json({error:"googleApiKey and typesafeApiKey are required"},{status:400});
  const supabase=getAdminClient(); const errors:any[]=[]; let runId:number|null=null;
  if(!dryRun){ const {data}=await supabase.from("vintpop_runs").insert({started_at:startedAt}).select("id").single(); runId=data?.id??null; }
  try{
    const found=await searchAll();
    if(dryRun) return Response.json({ok:true,fetched:found.size,sample:[...found.values()].slice(0,5).map((x)=>({id:x.item.id,title:x.item.title,price:x.item.price,queries:[...x.queries]}))});
    const ids=[...found.keys()], existingIds=new Set<string>();
    for(let i=0;i<ids.length;i+=100){ const batch=ids.slice(i,i+100); const {data}=await supabase.from("vintpop_listings").select("id").in("id",batch); for(const row of data??[]) existingIds.add(row.id); }
    const fresh=[...found.values()].filter((x)=>!existingIds.has(x.item.id)).sort((a,b)=>(Number(b.item.created_at)||0)-(Number(a.item.created_at)||0)).slice(0,MAX_NEW_PER_RUN);
    const sellerCache=new Map<string,any>(); const staged:Array<{item:SearchItem;queries:string[];seller:any;pre:any;preScore:number}>=[];
    for(const entry of fresh){
      const item=entry.item, queries=[...entry.queries];
      try{
        const seller=await enrichSeller(item.user_id,sellerCache); const pre=await preClassify(typesafeApiKey,item,queries,seller); staged.push({item,queries,seller,pre:pre.result,preScore:pre.preScore});
        await supabase.from("vintpop_listings").upsert({...publicRow(item,queries,seller),jev_pre:pre.result,pre_score:pre.preScore,candidate_score:pre.preScore*.7,status:pre.preScore>=.5?"pending":"discarded",error:null},{onConflict:"id"});
      }catch(error){ errors.push({item:item.id,stage:"pre",error:String(error)}); await supabase.from("vintpop_listings").upsert({...publicRow(item,queries,null),status:"error",error:String(error).slice(0,900)},{onConflict:"id"}); }
    }
    const googleCandidates=staged.filter((x)=>x.preScore>=.43&&imageUrls(x.item)[0]).sort((a,b)=>b.preScore-a.preScore).slice(0,MAX_GOOGLE_PER_RUN);
    let googleCalls=0, hotCount=0, reviewCount=0;
    for(const candidate of googleCandidates){
      try{
        const google=await googleWebDetection(googleApiKey,imageUrls(candidate.item)[0]); googleCalls++;
        const final=await finalClassify(typesafeApiKey,candidate.item,candidate.seller,candidate.pre,candidate.preScore,google);
        const status=final.candidateScore>=.76?"hot":final.candidateScore>=.52?"review":"discarded"; if(status==="hot")hotCount++; if(status==="review")reviewCount++;
        await supabase.from("vintpop_listings").update({google_vision:google.summary,visual_score:google.visualScore,jev_final:final.result,candidate_score:final.candidateScore,status,last_analyzed_at:new Date().toISOString(),error:null}).eq("id",candidate.item.id);
      }catch(error){
        errors.push({item:candidate.item.id,stage:"visual_final",error:String(error)}); const fallbackStatus=candidate.preScore>=.65?"review":"discarded"; if(fallbackStatus==="review")reviewCount++;
        await supabase.from("vintpop_listings").update({candidate_score:candidate.preScore*.78,status:fallbackStatus,error:String(error).slice(0,900),last_analyzed_at:new Date().toISOString()}).eq("id",candidate.item.id);
      }
    }
    const visualIds=new Set(googleCandidates.map((x)=>x.item.id));
    for(const candidate of staged){ if(visualIds.has(candidate.item.id))continue; if(candidate.preScore>=.58){ reviewCount++; await supabase.from("vintpop_listings").update({status:"review",candidate_score:candidate.preScore*.75}).eq("id",candidate.item.id); } }
    if(runId) await supabase.from("vintpop_runs").update({finished_at:new Date().toISOString(),fetched_count:found.size,new_count:fresh.length,analyzed_count:staged.length,google_calls:googleCalls,hot_count:hotCount,review_count:reviewCount,errors}).eq("id",runId);
    return Response.json({ok:true,fetched:found.size,new:fresh.length,analyzed:staged.length,googleCalls,hot:hotCount,review:reviewCount,errors:errors.slice(0,10)});
  }catch(error){
    errors.push({stage:"run",error:String(error)}); if(runId) await supabase.from("vintpop_runs").update({finished_at:new Date().toISOString(),errors}).eq("id",runId);
    return Response.json({ok:false,error:String(error),errors},{status:500});
  }
});