# Balance Young · Guía de configuración

Balance Young es una página estática (`index.html`, `app.js`, `privacidad.html`) publicada en Netlify. Las cuentas de usuario y los datos en la nube funcionan con Supabase.

## Conectar Supabase

1. Entra a tu proyecto en [supabase.com](https://supabase.com).
2. Abre **SQL Editor**, pega todo el contenido de `schema.sql` y pulsa **Run**.
   - Crea las tablas si no existen, activa las reglas de seguridad (RLS) para que cada persona solo vea sus propios datos y crea la función que usa el botón "Eliminar mi cuenta".
   - Se puede ejecutar varias veces sin perder datos.
3. Comprueba que RLS está activo con la consulta que aparece al final de `schema.sql`. Las tres tablas deben mostrar `true`.
4. En `app.js`, dentro de `CONFIG`, deben estar tu **Project URL** y tu clave **anon / publishable**. Esa clave es pública por diseño; la seguridad la dan las reglas RLS.
5. En **Authentication > URL Configuration**, añade `https://balanceyoung.netlify.app` como Site URL y como Redirect URL (lo necesitan el inicio de sesión con Google y la recuperación de contraseña).

Si dejas vacíos los datos de `CONFIG`, la página funciona en **modo demo**: los datos se guardan solo en el navegador.

## Formulario de contacto

El formulario "Escríbenos" usa Netlify Forms. Las consultas aparecen en el panel de Netlify, en **Forms > consulta**. Desde ahí puedes activar avisos por correo.

## Seguridad

`netlify.toml` añade cabeceras de seguridad (Content-Security-Policy, entre otras). Si en el futuro cargas scripts, fuentes o imágenes de otro dominio, añade ese dominio a la política en `netlify.toml`.

La librería de Supabase se carga en una versión fija (2.119.2) con comprobación de integridad (SRI). Para actualizarla, cambia la versión y el hash `integrity` en `index.html`.
