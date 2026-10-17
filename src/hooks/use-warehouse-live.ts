import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
export function useWarehouseLive() {
 const client=useQueryClient();
 useEffect(() => {
   const channel=supabase.channel('warehouse-live').on('postgres_changes',{ event:'*',schema:'public',table:'products'},()=>client.invalidateQueries({queryKey:['products']})).on('postgres_changes',{event:'*',schema:'public',table:'stock_movements'},()=>{client.invalidateQueries({queryKey:['movements']});client.invalidateQueries({queryKey:['products']});}).subscribe();
   return () => { void supabase.removeChannel(channel); };
 },[client]);
}