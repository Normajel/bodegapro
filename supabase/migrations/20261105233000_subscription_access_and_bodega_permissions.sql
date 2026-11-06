-- IntegraStock multiempresa only. Do not run on Contemar.
-- Restricts all tenant operational data by a current company subscription.
-- Company identities/memberships are intentionally readable to allow account recovery.
create or replace function public.tenant_subscription_valid(p_company_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
select p_company_id is not null and (select auth.uid()) is not null
 and exists(select 1 from public.company_memberships m
   where m.company_id=p_company_id and m.user_id=(select auth.uid()) and m.status='active')
 and exists(select 1 from public.companies c
   join billing.subscriptions s on s.company_id=c.id
   join billing.subscription_plans p on p.id=s.plan_id
   where c.id=p_company_id and c.status='active' and p.active=true
    and s.status in ('active','trial') and s.current_period_end>=current_date
    and (s.status<>'trial' or s.trial_ends_at is null or s.trial_ends_at>=current_date))
$$;
revoke all on function public.tenant_subscription_valid(uuid) from public,anon;
grant execute on function public.tenant_subscription_valid(uuid) to authenticated;

create or replace function public.tenant_guard_subscription_trigger()
returns trigger language plpgsql security definer set search_path=''
as $$
declare tenant_id uuid;
begin
 tenant_id := case when TG_OP='DELETE' then old.company_id else new.company_id end;
 if TG_OP='UPDATE' and old.company_id is distinct from new.company_id
 then raise exception 'No se puede trasladar un registro entre empresas' using errcode='42501'; end if;
 if not public.tenant_subscription_valid(tenant_id)
 then raise exception 'Suscripción inactiva, suspendida o vencida: ERP bloqueado' using errcode='42501'; end if;
 if TG_OP='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function public.tenant_guard_subscription_trigger() from public,anon,authenticated;

do $$
declare r record;
begin
 for r in select t.tablename
   from pg_tables t join information_schema.columns c
    on c.table_schema=t.schemaname and c.table_name=t.tablename and c.column_name='company_id'
   where t.schemaname='public' and t.rowsecurity
    and t.tablename not in (
      'company_memberships','platform_member_invitations',
      'tenant_member_role_audit','tenant_movement_counters','tenant_po_receipt_batches')
 loop
  execute format('drop policy if exists tenant_subscription_required on public.%I',r.tablename);
  execute format('create policy tenant_subscription_required on public.%I as restrictive for all to authenticated using (public.tenant_subscription_valid(company_id)) with check (public.tenant_subscription_valid(company_id))',r.tablename);
  execute format('drop trigger if exists tenant_subscription_write_guard on public.%I',r.tablename);
  execute format('create trigger tenant_subscription_write_guard before insert or update or delete on public.%I for each row execute function public.tenant_guard_subscription_trigger()',r.tablename);
 end loop;
end $$;
drop policy if exists products_insert on public.products;
create policy products_insert on public.products for insert to authenticated
 with check(exists(select 1 from public.company_memberships m
  where m.company_id=products.company_id and m.user_id=(select auth.uid())
  and m.status='active' and m.role_code in ('ADMIN','ADMINPRO')));
drop policy if exists products_update on public.products;
create policy products_update on public.products for update to authenticated
 using(exists(select 1 from public.company_memberships m
  where m.company_id=products.company_id and m.user_id=(select auth.uid())
  and m.status='active' and m.role_code in ('ADMIN','ADMINPRO')))
 with check(exists(select 1 from public.company_memberships m
  where m.company_id=products.company_id and m.user_id=(select auth.uid())
  and m.status='active' and m.role_code in ('ADMIN','ADMINPRO')));
revoke insert,update on public.products from authenticated;
