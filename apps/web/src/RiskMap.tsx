import {useEffect,useRef,useState} from 'react';
import type {Map as MapType,GeoJSONSource} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type {RiskItem} from './types';

type LayerKey='flood'|'mass'|'districts'|'alerts';
const LAYER_IDS:Record<LayerKey,string[]>={flood:['zone-flood'],mass:['zone-mass'],districts:['district-line'],alerts:['alert-fill','alert-line']};
const FLOOD=['#cfe3ef','#9ec5de','#5e9cc8','#2c6aa0','#173f6b'],MASS=['#efe2c8','#e0c38f','#c99b52','#9c6b2b','#6b4417'];
const ramp=(colors:string[])=>['match',['get','level'],1,colors[0],2,colors[1],3,colors[2],4,colors[3],5,colors[4],colors[2]] as any;

export default function RiskMap({items,hazards,districts,official,onSelect,selected}:{items:RiskItem[];hazards:GeoJSON.FeatureCollection;districts:GeoJSON.FeatureCollection|null;official:boolean;onSelect:(id:string)=>void;selected:string|null}) {
  const container=useRef<HTMLDivElement>(null),map=useRef<MapType|null>(null),select=useRef(onSelect),data=useRef(items),[mapError,setMapError]=useState(''),[ready,setReady]=useState(false);
  const [visible,setVisible]=useState<Record<LayerKey,boolean>>({flood:true,mass:true,districts:true,alerts:true}),visibleRef=useRef(visible);
  select.current=onSelect;data.current=items;visibleRef.current=visible;
  const geo=()=>({type:'FeatureCollection' as const,features:data.current.filter(b=>b.location).map(b=>({type:'Feature' as const,geometry:{type:'Point' as const,coordinates:b.location!},properties:{id:b.id,priority:b.priority,selected:b.id===selected}}))});
  const applyVisibility=(m:MapType)=>{for(const [key,ids] of Object.entries(LAYER_IDS))for(const id of ids)if(m.getLayer(id))m.setLayoutProperty(id,'visibility',visibleRef.current[key as LayerKey]?'visible':'none');};
  useEffect(()=>{
    let disposed=false;
    import('maplibre-gl').then(lib=>{
      if(disposed||!container.current)return;
      try {
        lib.setWorkerUrl(workerUrl);
        const m=new lib.Map({container:container.current,center:[-79.035,-8.11],zoom:11.3,attributionControl:false,
          style:{version:8,sources:{base:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'background',type:'background',paint:{'background-color':'#e4ecee'}},{id:'base',type:'raster',source:'base',paint:{'raster-saturation':-.8,'raster-opacity':.65}}]}});
        map.current=m;m.addControl(new lib.NavigationControl({showCompass:false}),'top-right');
        m.addControl(new lib.AttributionControl({compact:true,customAttribution:official?'Amenazas: CENEPRED · SENAMHI':'Escenario hipotético'}),'bottom-right');
        m.on('error',()=>setMapError('Mapa base no disponible. Los puntos y polígonos permanecen visibles.'));
        m.on('style.load',()=>{
          if(disposed)return;
          m.addSource('hazards',{type:'geojson',data:hazards});
          if(official) {
            m.addLayer({id:'zone-flood',type:'fill',source:'hazards',filter:['all',['==',['get','kind'],'susceptibility'],['==',['get','hazard_type'],'flood']],paint:{'fill-color':ramp(FLOOD),'fill-opacity':.55}});
            m.addLayer({id:'zone-mass',type:'fill',source:'hazards',filter:['all',['==',['get','kind'],'susceptibility'],['==',['get','hazard_type'],'mass_movement']],paint:{'fill-color':ramp(MASS),'fill-opacity':.5}});
            m.addLayer({id:'alert-fill',type:'fill',source:'hazards',filter:['==',['get','kind'],'alert'],paint:{'fill-color':'#c0392b','fill-opacity':.05}});
            m.addLayer({id:'alert-line',type:'line',source:'hazards',filter:['==',['get','kind'],'alert'],paint:{'line-color':'#b03228','line-width':2,'line-dasharray':[4,2]}});
            if(districts){m.addSource('districts',{type:'geojson',data:districts});m.addLayer({id:'district-line',type:'line',source:'districts',paint:{'line-color':'#2f4b55','line-width':1.1,'line-opacity':.7}});}
          } else {
            m.addLayer({id:'hazard-fill',type:'fill',source:'hazards',paint:{'fill-color':'#d09a38','fill-opacity':.16}});
            m.addLayer({id:'hazard-line',type:'line',source:'hazards',paint:{'line-color':'#ad7e25','line-width':1.5,'line-dasharray':[3,2]}});
          }
          applyVisibility(m);
          // Atribución compacta (se expande con el botón) y encuadre inicial en la cartera.
          container.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
          const pts=data.current.filter(b=>b.location).map(b=>b.location!);
          if(pts.length>1)m.fitBounds([[Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1]))],[Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))]],{padding:{top:40,bottom:60,left:official?150:40,right:50},animate:false,maxZoom:14});
          m.addSource('businesses',{type:'geojson',data:geo()});
          m.addLayer({id:'business-points',type:'circle',source:'businesses',paint:{'circle-radius':['case',['boolean',['get','selected'],false],9,4.5],
            'circle-color':['match',['get','priority'],'ALTA','#bc3d36','MEDIA','#b57820','BAJA','#277c71','#697c87'],'circle-stroke-width':1.5,'circle-stroke-color':'#fff','circle-opacity':.9}});
          m.on('click','business-points',e=>{const id=e.features?.[0]?.properties?.id;if(id)select.current(id);});
          m.on('mouseenter','business-points',()=>m.getCanvas().style.cursor='pointer');m.on('mouseleave','business-points',()=>m.getCanvas().style.cursor='');
          const onRender=()=>{if(m.queryRenderedFeatures({layers:['business-points']}).length){setReady(true);m.off('render',onRender);}};
          m.on('render',onRender);
        });
      }catch{setMapError('WebGL no disponible. Utilice la tabla de negocios para consultar la evaluación.');}
    }).catch(()=>setMapError('No se pudo cargar el mapa. Utilice la tabla de negocios.'));
    return ()=>{disposed=true;map.current?.remove();map.current=null;};
  },[hazards,districts,official]);
  useEffect(()=>{const source=map.current?.getSource('businesses') as GeoJSONSource|undefined;source?.setData(geo());},[items,selected]);
  useEffect(()=>{if(map.current?.isStyleLoaded())applyVisibility(map.current);},[visible]);
  const toggle=(key:LayerKey,label:string)=><label className="layer-toggle"><input type="checkbox" checked={visible[key]} onChange={e=>setVisible(v=>({...v,[key]:e.target.checked}))}/>{label}</label>;
  return <div className="map-frame"><div className="map-canvas" data-map-ready={ready} ref={container} role="region" aria-label={official?'Mapa de negocios ficticios y cartografía oficial CENEPRED/SENAMHI':'Mapa interactivo de negocios y amenazas hipotéticas'}/>
    <div className="map-title"><span className="status-dot"/> Trujillo y alrededores <small>WGS84 · {official?'CENEPRED + SENAMHI':'Escenario hipotético'}</small></div>
    {official&&<div className="layer-panel" aria-label="Capas del mapa">{toggle('flood','Inundación')}{toggle('mass','Mov. en masa')}{toggle('districts','Distritos')}{toggle('alerts','Avisos SENAMHI')}</div>}
    <div className="map-legend"><span><i className="dot high"/>Alta</span><span><i className="dot medium"/>Media</span><span><i className="dot low"/>Baja</span>
      {official?<><span className="ramp-key" title="Susceptibilidad a inundación, baja a muy alta">{FLOOD.slice(1).map(c=><i key={c} style={{background:c}}/>)}Inundación</span><span className="ramp-key" title="Susceptibilidad a movimientos en masa, baja a muy alta">{MASS.slice(1).map(c=><i key={c} style={{background:c}}/>)}Mov. masa</span><span className="alert-key">Aviso vigente</span></>:<span className="polygon-key">Área hipotética</span>}</div>
    {mapError&&<p className="map-warning" role="status">{mapError}</p>}
  </div>;
}
