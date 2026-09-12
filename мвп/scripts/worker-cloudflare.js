// Public deployment entry. Vinext owns HTTP routing; Cloudflare Cron uses the same protected sync route.
import app from '../dist/server/index.js';
const worker={
 fetch(request,env,ctx){return app.fetch(request,env,ctx);},
 scheduled(_controller,env,ctx){
  ctx.waitUntil((async()=>{
   if(!env.PUBLIC_APP_URL||!env.PUBLICATION_SYNC_SECRET)throw new Error('Publication scheduler configuration missing');
   const response=await app.fetch(new Request(env.PUBLIC_APP_URL+'/api/publication-sync',{method:'POST',headers:{Authorization:'Bearer '+env.PUBLICATION_SYNC_SECRET}}),env,ctx);
   if(!response.ok)throw new Error('Publication sync failed: '+response.status);
  })());
 }
};

export default worker;
