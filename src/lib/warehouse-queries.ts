import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const productsQuery = queryOptions({ queryKey: ['products'], queryFn: async () => {
  const { data, error } = await supabase.from('products').select('*').order('name');
  if(error) throw error; return data;
}});
export const suppliersQuery = queryOptions({ queryKey: ['suppliers'], queryFn: async () => {
  const { data, error } = await supabase.from('suppliers').select('*').order('name');
  if(error) throw error; return data;
}});
export const movementsQuery = queryOptions({ queryKey: ['movements'], queryFn: async () => {
  const rows = [];
  for(let offset=0; ; offset+=1000) {
    const { data, error } = await supabase.from('stock_movements').select('*, products(name, sku, unit), suppliers(name)').order('created_at', {ascending: false}).order('id').range(offset, offset+999);
    if(error) throw error; rows.push(...data); if(data.length<1000) break;
  }
  return rows;
}});
export type Movement = Awaited<ReturnType<NonNullable<typeof movementsQuery.queryFn>>>[number];