import {test,expect} from '@playwright/test';
import 'dotenv/config';
test('recorrido completo con API y PostgreSQL reales',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:1050});await page.goto('/');
  await expect(page.getByText('Negocios evaluados',{exact:true})).toBeVisible();await expect(page.getByText('1,000',{exact:true})).toBeVisible();
  await expect(page.locator('.map-canvas canvas')).toBeVisible({timeout:30000});
  await expect(page.locator('.map-canvas')).toHaveAttribute('data-map-ready','true',{timeout:30000});
  await expect(page.getByLabel('Procedencia de la evaluación')).toContainText('CENEPRED');await expect(page.getByLabel('Procedencia de la evaluación')).toContainText('Calidad de ubicación');
  await expect(page.locator('.official-context')).toContainText('EL PORVENIR');
  await page.screenshot({path:'artifacts/qa/dashboard.png',fullPage:true});
  await page.getByRole('button',{name:'Simulador financiero',exact:true}).click();await page.getByRole('button',{name:'Calcular escenario',exact:true}).click();
  await expect(page.locator('.cash-row').last()).toContainText('820');await expect(page.locator('.result-stats')).toContainText('1,880');
  await page.getByRole('button',{name:'Intervenciones',exact:true}).click();await page.getByRole('button',{name:'Optimizar plan',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Resultado del plan'})).toBeVisible({timeout:60000});
  await page.getByRole('button',{name:'Crear borradores para revisión'}).click();await expect(page.getByRole('button',{name:'Aprobar',exact:true}).first()).toBeVisible();
  await page.getByLabel('Credencial local de coordinador').fill(process.env.DEMO_COORDINATOR_TOKEN||'');await page.getByRole('button',{name:'Aprobar',exact:true}).first().click();
  await expect(page.getByText('Estado actualizado con auditoría.')).toBeVisible();
  await page.getByRole('button',{name:'Asistente IA',exact:true}).click();
  if(!process.env.GEMINI_API_KEY){await page.getByRole('button',{name:'Consultar asistente',exact:true}).click();await expect(page.getByText('Resumen sin IA',{exact:true})).toBeVisible();}
  await page.getByRole('button',{name:'Arquitectura',exact:true}).click();await page.getByRole('button',{name:/Motor de inteligencia climática/}).click();await expect(page.getByText(/Cruce geoespacial con bordes incluidos/)).toBeVisible();
  await page.getByRole('button',{name:'Fuentes de datos',exact:true}).click();await expect(page.getByRole('heading',{name:'Política de actualización'})).toBeVisible();
  await expect(page.getByRole('cell',{name:/CENEPRED · escenario de riesgo/})).toBeVisible();await expect(page.getByRole('button',{name:'Actualizar avisos SENAMHI'})).toBeVisible();
  await page.screenshot({path:'artifacts/qa/sources.png',fullPage:true});
  await page.getByLabel('Fuente de amenaza').selectOption('synthetic');await page.getByRole('button',{name:'Evaluar cartera',exact:true}).click();
  await expect(page.getByText(/contra el escenario sintético/)).toBeVisible();await page.getByRole('button',{name:'Centro de riesgo',exact:true}).click();
  await expect(page.locator('.kpi').nth(1)).toContainText('591');
  expect(errors).toEqual([]);
});
test('móvil y escenario sin mapa base externo',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.route('https://tile.openstreetmap.org/**',route=>route.abort());
  await page.goto('/');await expect(page.getByText('Negocios evaluados',{exact:true})).toBeVisible();
  await expect(page.getByText(/Mapa base no disponible/)).toBeVisible({timeout:30000});
  await expect(page.locator('.map-canvas')).toHaveAttribute('data-map-ready','true',{timeout:30000});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'artifacts/qa/mobile-offline.png',fullPage:true});
  await page.getByRole('button',{name:'Negocios',exact:true}).click();await page.getByRole('textbox',{name:'Buscar negocio'}).fill('CS-0001');await expect(page.getByText('Bodega Horizonte · caso representativo',{exact:true})).toBeVisible();
});

