import { CATEGORIES, UNITS } from './warehouse';
export const PRODUCT_COLUMNS = ['Descripción', 'Categoría', 'Unidad de medida', 'Proveedor', 'Cantidad inicial', 'Stock crítico', 'Costo unitario', 'Ubicación', 'Código de barras / QR'];
export async function downloadWorkbook(name: string, columns: string[], rows: (string | number | null)[][], template=false) {
 const { Workbook } = await import('exceljs');
 const book=new Workbook(); const sheet=book.addWorksheet(template?'Productos':name);
 book.creator='BodegaPro'; sheet.addRow(columns); rows.forEach(row=>sheet.addRow(row));
 sheet.views=[{state:'frozen',ySplit:1}]; sheet.autoFilter={from:'A1',to:{row:1,column:columns.length}};
 sheet.columns.forEach((col,i)=>{col.width=Math.min(38,Math.max(18,columns[i].length+3));});
 sheet.eachRow((row,index)=>{row.font={name:'Arial',size:11,color:{argb:index===1?'FFFFFFFF':'FF000000'}};row.height=index===1?30:22;if(index===1){row.font={...row.font,bold:true};row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF263445'}};}});
 if(template) {
  for(let r=2;r<=501;r++) {
   sheet.getCell(r,2).dataValidation={type:'list',allowBlank:false,formulae:[`"${CATEGORIES.join(',')}"`],showErrorMessage:true,error:'Selecciona una categoría del listado'};
   sheet.getCell(r,3).dataValidation={type:'list',allowBlank:true,formulae:[`"${UNITS.join(',')}"`]};
   [5,6,7].forEach(c=>{sheet.getCell(r,c).dataValidation={type:'decimal',operator:'greaterThanOrEqual',allowBlank:true,formulae:[0],showErrorMessage:true};});
  }
 }
 const bytes=await book.xlsx.writeBuffer(); const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const a=document.createElement('a');a.href=url;a.download=`${name}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export async function readProductWorkbook(file: File) {
 const { Workbook }=await import('exceljs');const book=new Workbook();await book.xlsx.load(await file.arrayBuffer());
 const sheet=book.worksheets[0]; if(!sheet) throw new Error('La planilla no contiene hojas');
 const headers=PRODUCT_COLUMNS.map((_,i)=>String(sheet.getCell(1,i+1).value??'').trim());
 if(PRODUCT_COLUMNS.some((name,i)=>headers[i]!==name)) throw new Error('Usa la plantilla de productos para conservar las columnas requeridas');
 const rows: Record<string,string|number>[]=[];
 sheet.eachRow((row,index)=>{if(index===1)return;const values:Record<string,string|number>={};PRODUCT_COLUMNS.forEach((key,i)=>{const value=row.getCell(i+1).value;values[key]=typeof value==='number'?value:row.getCell(i+1).text.trim();});if(Object.values(values).some(v=>v!==''))rows.push(values);});return rows;
}