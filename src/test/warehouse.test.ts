import { describe,it,expect } from 'vitest';
import { CATEGORIES,UNITS,CATEGORY_PREFIX,lastPurchases,periodBounds,normalizeCode } from '@/lib/warehouse';
describe('Reglas de bodega',()=>{
 it('conserva las seis categorías y sus prefijos distintos',()=>{expect(CATEGORIES).toEqual(['Estructura','Pintura','Gasfitería','Carpintería','Artículos eléctricos','Detalles']);expect(new Set(CATEGORIES.map(c=>CATEGORY_PREFIX[c])).size).toBe(6);});
 it('ofrece las siete unidades solicitadas',()=>expect(UNITS).toEqual(['UN','KG','ROLLO','LATA','TAMBOR','MT','LT']));
 it('conserva las últimas tres compras y no mezcla salidas ni productos',()=>{const rows=[10,20,30,40].map((cost,i)=>({product_id:'a',type:'entrada',created_at:`2026-10-${10+i}`,unit_cost:cost,quantity_value:1,supplier_id:null}));rows.push({...rows[3],type:'salida',unit_cost:99});rows.push({...rows[3],product_id:'b',unit_cost:88});expect(lastPurchases(rows,'a').map(p=>p.unit_cost)).toEqual([40,30,20]);});
 it('últimos siete días incluye hoy y seis anteriores',()=>expect(periodBounds('week','2026-10',new Date('2026-10-17T12:00:00Z'))).toEqual({from:'2026-10-11',to:'2026-10-17'}));
 it('mes calendario incluye los 31 días de octubre',()=>expect(periodBounds('month','2026-10')).toEqual({from:'2026-10-01',to:'2026-10-31'}));
 it('mes calendario limita febrero a sus días reales',()=>expect(periodBounds('month','2026-02')).toEqual({from:'2026-02-01',to:'2026-02-28'}));
 it('asocia el SKU contenido en un QR',()=>expect(normalizeCode('https://example.com/product?sku=EST-000001')).toBe('EST-000001'));
});