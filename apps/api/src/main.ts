import 'reflect-metadata';
import 'dotenv/config';
import { Module,Catch,HttpException,type ExceptionFilter,type ArgumentsHost } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { z } from 'zod';
import { ApiController } from './controller.js';
import { Repository } from './repository.js';
import { pool,transaction } from './database.js';
import { fetchSenamhi,persistSenamhi } from './official.js';

@Catch()
class ApiErrors implements ExceptionFilter {
  catch(error:unknown,host:ArgumentsHost) {
    const res=host.switchToHttp().getResponse();
    if(error instanceof z.ZodError) return res.status(422).json({code:'VALIDATION_ERROR',message:'Revise los campos de entrada',details:error.issues.map(i=>({field:i.path.join('.'),message:i.message}))});
    const status=error instanceof HttpException?error.getStatus():503;
    return res.status(status).json({code:`HTTP_${status}`,message:error instanceof HttpException?error.message:'Servicio no disponible. Verifique PostgreSQL y las migraciones.',details:null});
  }
}
@Module({controllers:[ApiController],providers:[Repository]})
export class AppModule {}
export async function createApp() {
  const app=await NestFactory.create(AppModule,{logger:['error','warn','log']});
  app.enableCors({origin:(process.env.CORS_ORIGINS||'http://localhost:5180,http://127.0.0.1:5180').split(','),methods:['GET','POST','PATCH'],allowedHeaders:['Content-Type','X-Coordinator-Token']});
  app.useGlobalFilters(new ApiErrors());app.enableShutdownHooks();return app;
}
if(process.argv[1]?.replaceAll('\\','/').match(/\/(main\.(ts|js))$/)) {
  const app=await createApp();
  await pool.query('SELECT 1').catch(()=>console.warn('PostgreSQL no disponible: inicie Docker y aplique migraciones.'));
  await app.listen(Number(process.env.PORT||8081),process.env.HOST||'127.0.0.1');
  // Refresco opcional de avisos SENAMHI (política propuesta: 30 min). Desactivado por defecto.
  const minutes=Number(process.env.SENAMHI_REFRESH_MINUTES||0);
  if(minutes>=5) {
    const refresh=()=>fetchSenamhi().then(r=>transaction(c=>persistSenamhi(c,r))).then(r=>console.log(`SENAMHI ${r.status}: ${r.stored} zonas`)).catch(()=>console.warn('SENAMHI: refresco fallido; se conservan los últimos avisos.'));
    setInterval(refresh,minutes*60000).unref();void refresh();
  }
}

