(()=>{var a={};a.id=544,a.ids=[544],a.modules={261:a=>{"use strict";a.exports=require("next/dist/shared/lib/router/utils/app-paths")},846:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-page.runtime.prod.js")},2463:a=>{"use strict";a.exports=import("@prisma/adapter-better-sqlite3")},2543:(a,b,c)=>{"use strict";c.a(a,async(a,d)=>{try{c.r(b),c.d(b,{GET:()=>i,dynamic:()=>j});var e=c(3211),f=c(9494),g=c(3356),h=a([f,g]);[f,g]=h.then?(await h)():h;let j="force-dynamic";async function i(a){try{if(!await (0,g.aN)(a))return e.NextResponse.json({error:"Unauthorized"},{status:401});let b=new Date,c=new Date(b.getFullYear(),b.getMonth(),b.getDate()),d=await f.A.order.findMany({select:{status:!0,priority:!0,enteredAt:!0,pickedAt:!0,packedAt:!0,dispatchedAt:!0}}),h={RECEIVED:0,PICKING:0,PACKING:0,QUALITY_CHECK:0,STAGED:0,DISPATCHED:0,ON_HOLD:0,TOTAL:d.length},i=0,j=0;d.forEach(a=>{void 0!==h[a.status]&&h[a.status]++,"EXPRESS"===a.priority&&i++,"URGENT"===a.priority&&j++});let k=[],l=[],m=[];d.forEach(a=>{if(a.enteredAt&&a.pickedAt){let b=(new Date(a.pickedAt)-new Date(a.enteredAt))/6e4;b>=0&&b<1e4&&k.push(b)}if(a.pickedAt&&a.packedAt){let b=(new Date(a.packedAt)-new Date(a.pickedAt))/6e4;b>=0&&b<1e4&&l.push(b)}if(a.enteredAt&&a.dispatchedAt){let b=(new Date(a.dispatchedAt)-new Date(a.enteredAt))/6e4;b>=0&&b<2e4&&m.push(b)}});let n=a=>a.length?Math.round(a.reduce((a,b)=>a+b,0)/a.length*10)/10:0,o={avgPickingMin:n(k),avgPackingMin:n(l),avgTotalFulfillmentMin:n(m)},p=await f.A.user.findMany({select:{id:!0,username:!0,name:!0,role:!0,isActive:!0,lastSeen:!0,lastAction:!0,lastActionAt:!0},orderBy:{name:"asc"}}),q=await f.A.orderEvent.findMany({where:{timestamp:{gte:c}}}),r={};p.forEach(a=>{r[a.name]={name:a.name,username:a.username,role:a.role,isActive:a.isActive,lastAction:a.lastAction,lastActionAt:a.lastActionAt,pickedToday:0,packedToday:0,dispatchedToday:0,totalActionsToday:0}}),q.forEach(a=>{let b=r[a.actorName];b&&(b.totalActionsToday++,"PICKING"===a.status&&b.pickedToday++,"PACKING"===a.status&&b.packedToday++,"DISPATCHED"===a.status&&b.dispatchedToday++)});let s=Object.values(r).sort((a,b)=>b.totalActionsToday-a.totalActionsToday),t=Array(24).fill(0);return q.forEach(a=>{let b=new Date(a.timestamp).getHours();t[b]++}),e.NextResponse.json({statusCounts:h,turnaroundAverages:o,priorityDistribution:{standard:d.length-i-j,express:i,urgent:j},leaderboard:s,hourlyThroughput:t,dispatchedTodayCount:d.filter(a=>a.dispatchedAt&&new Date(a.dispatchedAt)>=c).length})}catch(a){return console.error("KPI error:",a),e.NextResponse.json({error:a.message},{status:500})}}d()}catch(a){d(a)}})},2611:(a,b,c)=>{"use strict";c.r(b),c.d(b,{handler:()=>z,patchFetch:()=>y,routeModule:()=>u,serverHooks:()=>x,workAsyncStorage:()=>v,workUnitAsyncStorage:()=>w});var d=c(9225),e=c(4006),f=c(8317),g=c(9373),h=c(4775),i=c(4235),j=c(261),k=c(4365),l=c(771),m=c(3461),n=c(7798),o=c(2280),p=c(2018),q=c(5696),r=c(7929),s=c(6439),t=c(7527);let u=new d.AppRouteRouteModule({definition:{kind:e.RouteKind.APP_ROUTE,page:"/api/analytics/kpis/route",pathname:"/api/analytics/kpis",filename:"route",bundlePath:"app/api/analytics/kpis/route"},distDir:".next",relativeProjectDir:"",resolvedPagePath:"D:\\AASHISH\\Projects\\Order Tracking\\app\\api\\analytics\\kpis\\route.js",nextConfigOutput:"",userland:()=>c(2543),...{}}),{workAsyncStorage:v,workUnitAsyncStorage:w,serverHooks:x}=u;function y(){return(0,f.patchFetch)({workAsyncStorage:v,workUnitAsyncStorage:w})}async function z(a,b,c){c.requestMeta&&(0,g.setRequestMeta)(a,c.requestMeta),u.isDev&&(0,g.addRequestMeta)(a,"devRequestTimingInternalsEnd",process.hrtime.bigint());let d="/api/analytics/kpis/route";"/index"===d&&(d="/");let f=await u.prepare(a,b,{srcPage:d,multiZoneDraftMode:!1});if(!f)return b.statusCode=400,b.end("Bad Request"),null==c.waitUntil||c.waitUntil.call(c,Promise.resolve()),null;let{buildId:v,deploymentId:w,params:x,nextConfig:y,parsedUrl:z,isDraftMode:A,prerenderManifest:B,routerServerContext:C,isOnDemandRevalidate:D,revalidateOnlyGenerated:E,resolvedPathname:F,clientReferenceManifest:G,serverActionsManifest:H}=f,I=(0,j.normalizeAppPath)(d),J=!!(B.dynamicRoutes[I]||B.routes[F]),K=async()=>((null==C?void 0:C.render404)?await C.render404(a,b,z,!1):b.end("This page could not be found"),null);if(J&&!A){let a=!!B.routes[F],b=B.dynamicRoutes[I];if(b&&!1===b.fallback&&!a){if(y.adapterPath)return await K();throw new s.NoFallbackError}}let L=null;!J||u.isDev||A||(L="/index"===(L=F)?"/":L);let M=!0===u.isDev||!J,N=J&&!M;H&&G&&(0,i.setManifestsSingleton)({page:d,clientReferenceManifest:G,serverActionsManifest:H});let O=a.method||"GET",P=(0,h.getTracer)(),Q=P.getActiveScopeSpan(),R=!!(null==C?void 0:C.isWrappedByNextServer),S=!!(0,g.getRequestMeta)(a,"minimalMode"),T=(0,g.getRequestMeta)(a,"incrementalCache")||await u.getIncrementalCache(a,y,B,S);null==T||T.resetRequestCache(),globalThis.__incrementalCache=T;let U={params:x,previewProps:B.preview,renderOpts:{experimental:{authInterrupts:!!y.experimental.authInterrupts,useCacheTimeout:y.experimental.useCacheTimeout},cacheComponents:!!y.cacheComponents,validationLevel:y.experimental.instantInsights.validationLevel,supportsDynamicResponse:M,incrementalCache:T,hmrRefreshHash:(0,g.getRequestMeta)(a,"hmrRefreshHash"),cacheLifeProfiles:y.cacheLife,staticPageGenerationTimeout:y.staticPageGenerationTimeout,waitUntil:c.waitUntil,onClose:a=>{b.on("close",a)},onAfterTaskError:void 0,onInstrumentationRequestError:(b,c,d,e)=>u.onRequestError(a,b,d,e,C)},sharedContext:{buildId:v,deploymentId:w}},V=new k.NodeNextRequest(a),W=new k.NodeNextResponse(b),X=l.NextRequestAdapter.fromNodeNextRequest(V,(0,l.signalFromNodeResponse)(b)),Y=async({previousCacheEntry:e})=>{try{if(!S&&D&&E&&!e)return b.statusCode=404,b.setHeader("x-nextjs-cache","REVALIDATED"),b.end("This page could not be found"),null;let d=await u.handle(X,U);a.fetchMetrics=U.renderOpts.fetchMetrics;let f=U.renderOpts.pendingWaitUntil;f&&c.waitUntil&&(c.waitUntil(f),f=void 0);let g=U.renderOpts.collectedTags;if(!J)return await (0,o.I)(V,W,d,f),null;{let a=await d.blob(),b=(0,p.toNodeOutgoingHttpHeaders)(d.headers);g&&(b[r.NEXT_CACHE_TAGS_HEADER]=g),!b["content-type"]&&a.type&&(b["content-type"]=a.type);let c=void 0!==U.renderOpts.collectedRevalidate&&!(U.renderOpts.collectedRevalidate>=r.INFINITE_CACHE)&&U.renderOpts.collectedRevalidate,e=void 0===U.renderOpts.collectedExpire||U.renderOpts.collectedExpire>=r.INFINITE_CACHE?!1!==c&&c>0?y.expireTime:void 0:U.renderOpts.collectedExpire;return{value:{kind:t.CachedRouteKind.APP_ROUTE,status:d.status,body:Buffer.from(await a.arrayBuffer()),headers:b},cacheControl:{revalidate:c,expire:e}}}}catch(b){throw(null==e?void 0:e.isStale)&&await u.onRequestError(a,b,{routerKind:"App Router",routePath:d,routeType:"route",revalidateReason:(0,n.getRevalidateReason)({isStaticGeneration:N,isOnDemandRevalidate:D})},!1,C),b}},Z=async(d,f)=>{try{var g,i;let d=await u.handleResponse({req:a,nextConfig:y,cacheKey:L,routeKind:e.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:B,isRoutePPREnabled:!1,isOnDemandRevalidate:D,revalidateOnlyGenerated:E,responseGenerator:Y,waitUntil:c.waitUntil,isMinimalMode:S});if(!J)return;if((null==d||null==(g=d.value)?void 0:g.kind)!==t.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==d||null==(i=d.value)?void 0:i.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});S||b.setHeader("x-nextjs-cache",D?"REVALIDATED":d.isMiss?"MISS":d.isStale?"STALE":"HIT"),A&&b.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let f=(0,p.fromNodeOutgoingHttpHeaders)(d.value.headers);S&&J||f.delete(r.NEXT_CACHE_TAGS_HEADER),!d.cacheControl||b.getHeader("Cache-Control")||f.get("Cache-Control")||f.set("Cache-Control",(0,q.getCacheControlHeader)(d.cacheControl)),await (0,o.I)(V,W,new Response(d.value.body,{headers:f,status:d.value.status||200}));return}catch(b){if(b instanceof s.NoFallbackError||await u.onRequestError(a,b,{routerKind:"App Router",routePath:I,routeType:"route",revalidateReason:(0,n.getRevalidateReason)({isStaticGeneration:N,isOnDemandRevalidate:D})},!1,C),J)throw b;await (0,o.I)(V,W,new Response(null,{status:500}));return}finally{(()=>{if(!d)return;let a=b.statusCode;d.setAttributes({"http.status_code":a,"next.rsc":!1}),a&&a>=500&&(d.setStatus({code:h.SpanStatusCode.ERROR}),d.setAttribute("error.type",a.toString()));let c=P.getRootSpanAttributes();if(!c)return;if(c.get("next.span_type")!==m.BaseServerSpan.handleRequest)return console.warn(`Unexpected root span type '${c.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let e=c.get("next.route")||I,g=`${O} ${e}`;d.setAttributes({"next.route":e,"http.route":e,"next.span_name":g}),d.updateName(g),f&&f!==d&&(f.setAttribute("http.route",e),f.updateName(g))})()}};if(R&&Q)await Z(Q,void 0);else{let b=P.getActiveScopeSpan();await P.withPropagatedContext(a.headers,()=>P.trace(m.BaseServerSpan.handleRequest,{spanName:`${O} ${d}`,kind:h.SpanKind.SERVER,attributes:{"http.method":O,"http.target":a.url}},a=>Z(a,b)),void 0,!R)}}},3033:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-unit-async-storage.external.js")},3295:a=>{"use strict";a.exports=require("next/dist/server/app-render/after-task-async-storage.external.js")},3356:(a,b,c)=>{"use strict";c.a(a,async(a,d)=>{try{c.d(b,{BE:()=>l,Er:()=>k,Q7:()=>m,aN:()=>n,c4:()=>o});var e=c(5511),f=c(4433),g=c(7509),h=c(5573),i=c(9494),j=a([i]);i=(j.then?(await j)():j)[0];let p=new TextEncoder().encode(process.env.JWT_SECRET||"warehouse-wms-super-secret-jwt-key-2026");function k(a){let b=e.randomBytes(16).toString("hex"),c=e.scryptSync(a,b,64);return`${b}:${c.toString("hex")}`}function l(a,b){if(!b)return!1;if(!b.includes(":"))return a===b;let[c,d]=b.split(":"),f=Buffer.from(d,"hex"),g=e.scryptSync(a,c,64);return e.timingSafeEqual(f,g)}async function m(a){return await new f.P({userId:a.id,name:a.name,username:a.username,role:a.role,adminId:a.adminId||null,permissions:{canViewOrders:a.canViewOrders??!0,canPickPack:a.canPickPack??!0,canDispatch:a.canDispatch??!1,canUpload:a.canUpload??!1,canExport:a.canExport??!1,canViewLogs:a.canViewLogs??!1}}).setProtectedHeader({alg:"HS256"}).setExpirationTime("7d").sign(p)}async function n(a=null){try{let b=null;if(a&&a.headers){let c=a.headers.get("authorization")||a.headers.get("x-wms-token");c&&(b=c.replace(/^Bearer\s+/i,"").trim())}if(!b)try{let a=await (0,h.b3)(),c=a.get("authorization")||a.get("x-wms-token");c&&(b=c.replace(/^Bearer\s+/i,"").trim())}catch(a){}if(!b)try{let a=await (0,h.UL)();b=a.get("token")?.value}catch(a){}if(!b)return null;let{payload:c}=await (0,g.V)(b,p);return c}catch{return null}}async function o(a,b=null){try{if(!a)return;let c={lastSeen:new Date};b&&(c.lastAction=b,c.lastActionAt=new Date),await i.A.user.update({where:{id:a},data:c})}catch{}}d()}catch(a){d(a)}})},3873:a=>{"use strict";a.exports=require("path")},4870:a=>{"use strict";a.exports=require("next/dist/compiled/next-server/app-route.runtime.prod.js")},5511:a=>{"use strict";a.exports=require("crypto")},6330:a=>{"use strict";a.exports=require("@prisma/client")},6439:a=>{"use strict";a.exports=require("next/dist/shared/lib/no-fallback-error.external")},6487:()=>{},7550:a=>{"use strict";a.exports=require("better-sqlite3")},8128:a=>{"use strict";a.exports=require("next/dist/server/runtime-reacts.external.js")},8335:()=>{},9021:a=>{"use strict";a.exports=require("fs")},9121:a=>{"use strict";a.exports=require("next/dist/server/app-render/action-async-storage.external.js")},9294:a=>{"use strict";a.exports=require("next/dist/server/app-render/work-async-storage.external.js")},9494:(a,b,c)=>{"use strict";c.a(a,async(a,d)=>{try{c.d(b,{A:()=>k});var e=c(2463),f=c(6330),g=c(3873),h=c(7550),i=c(9021),j=a([e]);e=(j.then?(await j)():j)[0];let k=globalThis.prismaClient??function(){let a=process.env.SQLITE_DB_PATH||g.join(process.cwd(),"dev.db");try{let b=g.dirname(a);i.existsSync(b)||i.mkdirSync(b,{recursive:!0});let c=new h(a);c.pragma("journal_mode = WAL"),c.pragma("synchronous = NORMAL"),c.pragma("busy_timeout = 5000"),c.pragma("cache_size = -64000"),c.pragma("temp_store = MEMORY"),c.pragma("foreign_keys = ON"),c.exec(`
      CREATE TABLE IF NOT EXISTS "Config" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "key" TEXT NOT NULL UNIQUE,
          "value" TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "User" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "username" TEXT NOT NULL UNIQUE,
          "name" TEXT NOT NULL,
          "passwordHash" TEXT NOT NULL,
          "role" TEXT NOT NULL DEFAULT 'WORKER',
          "adminId" TEXT,
          "canViewOrders" BOOLEAN NOT NULL DEFAULT 1,
          "canPickPack" BOOLEAN NOT NULL DEFAULT 1,
          "canDispatch" BOOLEAN NOT NULL DEFAULT 0,
          "canUpload" BOOLEAN NOT NULL DEFAULT 0,
          "canExport" BOOLEAN NOT NULL DEFAULT 0,
          "canViewLogs" BOOLEAN NOT NULL DEFAULT 0,
          "isActive" BOOLEAN NOT NULL DEFAULT 1,
          "lastSeen" DATETIME,
          "lastAction" TEXT,
          "lastActionAt" DATETIME,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("adminId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE IF NOT EXISTS "Order" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "orderNo" TEXT NOT NULL UNIQUE,
          "invoiceNo" TEXT,
          "lrNo" TEXT,
          "sent" BOOLEAN NOT NULL DEFAULT 0,
          "status" TEXT NOT NULL DEFAULT 'RECEIVED',
          "priority" TEXT NOT NULL DEFAULT 'STANDARD',
          "zone" TEXT,
          "dockBay" TEXT,
          "transporter" TEXT,
          "vehicleNo" TEXT,
          "boxCount" INTEGER NOT NULL DEFAULT 1,
          "itemCount" INTEGER NOT NULL DEFAULT 1,
          "skuList" TEXT,
          "manifestId" TEXT,
          "targetSla" DATETIME,
          "weightKg" REAL,
          "notes" TEXT,
          "extra" TEXT,
          "enteredBy" TEXT,
          "enteredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "pickedBy" TEXT,
          "pickedAt" DATETIME,
          "packedBy" TEXT,
          "packedAt" DATETIME,
          "dispatchedAt" DATETIME,
          "updatedBy" TEXT,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS "OrderEvent" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "orderId" TEXT NOT NULL,
          "status" TEXT NOT NULL,
          "actorName" TEXT NOT NULL,
          "actorRole" TEXT NOT NULL,
          "note" TEXT,
          "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE IF NOT EXISTS "Log" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "userId" TEXT,
          "name" TEXT NOT NULL,
          "role" TEXT NOT NULL,
          "action" TEXT NOT NULL,
          "detail" TEXT,
          FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
      );

      -- High-Performance Industrial Database Indexes
      CREATE INDEX IF NOT EXISTS "idx_order_status" ON "Order"("status");
      CREATE INDEX IF NOT EXISTS "idx_order_updatedAt" ON "Order"("updatedAt");
      CREATE INDEX IF NOT EXISTS "idx_order_priority" ON "Order"("priority");
      CREATE INDEX IF NOT EXISTS "idx_order_invoiceNo" ON "Order"("invoiceNo");
      CREATE INDEX IF NOT EXISTS "idx_order_lrNo" ON "Order"("lrNo");
      CREATE INDEX IF NOT EXISTS "idx_order_transporter" ON "Order"("transporter");
      CREATE INDEX IF NOT EXISTS "idx_order_zone" ON "Order"("zone");
      CREATE INDEX IF NOT EXISTS "idx_orderevent_orderId" ON "OrderEvent"("orderId");
      CREATE INDEX IF NOT EXISTS "idx_orderevent_timestamp" ON "OrderEvent"("timestamp");
      CREATE INDEX IF NOT EXISTS "idx_log_timestamp" ON "Log"("timestamp");
      CREATE INDEX IF NOT EXISTS "idx_log_userId" ON "Log"("userId");
    `),c.close()}catch(a){console.error("Error auto-initializing SQLite tables and pragmas:",a)}let b=new e.PrismaBetterSqlite3({url:`file:${a}`});return new f.PrismaClient({adapter:b})}();d()}catch(a){d(a)}})}};var b=require("../../../../webpack-runtime.js");b.C(a);var c=b.X(0,[445,813,81],()=>b(b.s=2611));module.exports=c})();