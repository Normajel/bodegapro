-- INTEGRASTOCK Multiempresa: asignar cuentas Auth YA CREADAS a los DEMO.
-- EJECUCIÓN MANUAL Y ADMINISTRATIVA en el proyecto vatpxpzdxstysvchyqqk.
-- NO EJECUTAR sin sustituir ambos correos por cuentas de prueba reales confirmadas.
-- Este script NO crea cuentas, contraseñas ni modifica Contemar.
begin;
do $$
declare
  v_north_email text := 'REEMPLAZAR_NORTE@example.invalid';
  v_south_email text := 'REEMPLAZAR_SUR@example.invalid';
  v_north_user uuid;
  v_south_user uuid;
  v_north_company uuid := 'e3800000-0000-4000-8000-000000000001';
  v_south_company uuid := 'e3800000-0000-4000-8000-000000000002';
begin
  if v_north_email like 'REEMPLAZAR_%'
     or v_south_email like 'REEMPLAZAR_%'
     or lower(trim(v_north_email)) = lower(trim(v_south_email)) then
    raise exception 'Configura dos correos distintos de cuentas Auth confirmadas';
  end if;

  select id into strict v_north_user
  from auth.users
  where lower(email) = lower(trim(v_north_email)) and email_confirmed_at is not null;

  select id into strict v_south_user
  from auth.users
  where lower(email) = lower(trim(v_south_email)) and email_confirmed_at is not null;

  if not exists (select 1 from public.companies
    where id=v_north_company and name='DEMO · Empresa Norte' and status='active')
    or not exists (select 1 from public.companies
    where id=v_south_company and name='DEMO · Empresa Sur' and status='active')
  then
    raise exception 'Las empresas DEMO esperadas no están activas';
  end if;

  -- REQUIERE que ambas cuentas no tengan asignaciones previas a estas DEMO.
  if exists (
    select 1 from public.company_memberships
    where (company_id=v_north_company and user_id<>v_north_user)
       or (company_id=v_south_company and user_id<>v_south_user)
  ) then
    raise exception 'Ya existen membresías DEMO distintas: requiere revisión manual';
  end if;

  insert into public.company_memberships(company_id,user_id,role_code,status)
  values (v_north_company,v_north_user,'BODEGA','active'),
         (v_south_company,v_south_user,'BODEGA','active')
  on conflict (company_id,user_id) do update
     set role_code=excluded.role_code,status=excluded.status;
end $$;

select c.name,m.role_code,m.status,u.email
from public.company_memberships m
join public.companies c on c.id=m.company_id
join auth.users u on u.id=m.user_id
where c.id in ('e3800000-0000-4000-8000-000000000001',
               'e3800000-0000-4000-8000-000000000002')
order by c.name;
commit;
