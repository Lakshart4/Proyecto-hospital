# Requirements Document

## Introduction

El Sistema de Gestión y Administración Hospitalaria (en adelante, el Sistema) es una aplicación web interna de administración para un hospital ficticio. Es un prototipo académico del curso "Portales Web" y debe ser una aplicación Full Stack real: frontend, backend, base de datos y autenticación.

Tecnologías obligatorias: React + TypeScript + Vite + Tailwind CSS (frontend); Node.js + Express + TypeScript (backend); SQLite + Prisma ORM (base de datos). La arquitectura debe ser simple, comprensible y modificable por un estudiante Junior Full Stack.

El Sistema cubre ocho módulos: Dashboard administrativo, Personal, Pacientes, Inventario, Inventario de limpieza, Equipos médicos, Habitaciones y Calendarios. Usa autenticación basada en sesiones, recuperación de contraseña por correo electrónico, control de acceso por roles (RBAC), autorización administrativa temporal para documentos de empleados, validación en frontend y backend, y bitácora de auditoría de accesos y modificaciones sensibles. Toda la interfaz está en español.

Alcance excluido: diagnósticos automatizados, recetas médicas reales, facturación, historias clínicas completas e integraciones con sistemas hospitalarios externos. Todos los datos son ficticios y de demostración; el Sistema no contiene datos reales de pacientes ni de empleados.

## Glossary

- **Sistema**: Aplicación web completa (frontend, backend y base de datos) del hospital ficticio.
- **Frontend**: Aplicación cliente construida con React, TypeScript, Vite y Tailwind CSS.
- **API**: API REST propia del Backend, construida con Node.js, Express y TypeScript.
- **Backend**: Servidor que expone la API, aplica autenticación, autorización y validación, y accede a la Base_de_Datos.
- **Base_de_Datos**: Base de datos SQLite accedida mediante Prisma ORM.
- **Usuario**: Persona autenticada con una cuenta propia en el Sistema.
- **Administrador**: Usuario con rol de administrador general y acceso a todos los módulos.
- **Director**: Usuario con Rol Administrador que ejerce la dirección del hospital. El Director no tiene un Rol adicional ni credenciales distintas de las de su propia cuenta.
- **Médico**: Usuario con rol de doctor.
- **Enfermero**: Usuario con rol de enfermería.
- **Personal_de_Limpieza**: Usuario con rol de personal de limpieza.
- **Empleado**: Cualquier Usuario con rol Médico, Enfermero o Personal_de_Limpieza.
- **Rol**: Conjunto de permisos asignado a un Usuario (Administrador, Médico, Enfermero o Personal_de_Limpieza).
- **Sesión**: Sesión autenticada del Usuario mantenida mediante una cookie de sesión del lado del servidor.
- **Correo_Electrónico**: Dirección de correo única de una cuenta, con dominio ficticio de demostración, usada como nombre de usuario y para la recuperación de contraseña.
- **Token_de_Recuperación**: Valor aleatorio de un solo uso y vigencia limitada, enviado por correo para restablecer una contraseña.
- **Bandeja_Local**: Salida de correo de demostración del Backend, visible en la consola del Backend, usada cuando no hay un servidor SMTP configurado.
- **Autorización_Administrativa**: Credencial temporal de 10 minutos, asociada a una Sesión de Administrador, que el Backend otorga cuando el Administrador vuelve a ingresar su propia contraseña, y que habilita la consulta y gestión de Documentos_de_Empleado.
- **Módulo_Dashboard**: Módulo del panel administrativo con estadísticas e indicadores.
- **Módulo_Personal**: Módulo de gestión de empleados.
- **Módulo_Pacientes**: Módulo de gestión de pacientes.
- **Módulo_Inventario**: Módulo de gestión de Productos de categoría insumo médico y medicamento.
- **Módulo_Inventario_Limpieza**: Módulo independiente de gestión de Productos de categoría material de limpieza, con pantalla, recursos de API y entrada de menú propios.
- **Módulo_Equipos**: Módulo de gestión de equipos médicos.
- **Módulo_Habitaciones**: Módulo de gestión de habitaciones, asignaciones e historial de ocupación.
- **Módulo_Calendarios**: Módulo de calendarios y agendas.
- **Perfil**: Datos de un Empleado: foto, nombre, correo electrónico, ID interno, cargo, descripción, especialidad, departamento, años de experiencia, turno y horario de trabajo.
- **Turno**: Franja laboral de un Empleado, con valores "matutino" o "vespertino".
- **Horario_de_Trabajo**: Agenda semanal editable de un Empleado que define, por día de la semana, la hora de entrada, la hora de salida, el periodo de comida y los Descansos.
- **Descanso**: Intervalo breve dentro del Horario_de_Trabajo de un día, con hora de inicio y hora de fin.
- **Documento_de_Empleado**: Archivo PDF ficticio asociado a un Empleado, de tipo "contratación" o "acreditación", con título y fechas de emisión y vencimiento.
- **Apartado_Privado**: Sección del Frontend donde un Empleado consulta únicamente sus propios Documentos_de_Empleado.
- **Departamento**: Unidad del hospital. Valores iniciales: Urgencias, Cardiología, Pediatría, Cirugía, Radiología y Medicina Interna.
- **Paciente**: Persona ficticia registrada en el Sistema para atención hospitalaria.
- **Estado_del_Paciente**: Valor "activo", "dado de alta" o "fallecido". El valor "fallecido" es definitivo.
- **Historial_del_Paciente**: Lista cronológica e inmodificable de Registros_de_Movimiento_del_Paciente.
- **Registro_de_Movimiento_del_Paciente**: Entrada del Historial_del_Paciente de tipo "ingreso", "alta" o "fallecimiento", con fecha y hora, Departamento, usuario y observación.
- **Tratamiento_Programado**: Tratamiento o cirugía asociado a un Paciente, con tipo ("tratamiento" o "cirugía"), fecha programada y estado ("programado", "realizado" o "cancelado").
- **Observación_Médica**: Texto breve de un Paciente que solo el Médico responsable (y el Administrador) actualiza.
- **Observación_de_Enfermería**: Texto breve de un Paciente que solo el Enfermero responsable (y el Administrador) actualiza.
- **Producto**: Elemento del inventario de categoría insumo médico, medicamento o material de limpieza.
- **Subcategoría_de_Insumo**: Clasificación de un Producto de categoría insumo médico: jeringa, sonda, catéter, suero, instrumental o material médico.
- **Stock_Mínimo**: Cantidad mínima configurada de un Producto.
- **Stock_Bajo**: Condición en la que la cantidad de un Producto es menor o igual que su Stock_Mínimo.
- **Proveedor**: Entidad ficticia que suministra Productos.
- **Entrega_de_Proveedor**: Registro de una entrega de un Producto por su Proveedor, con cantidad solicitada, fecha programada, estado ("programada", "recibida" o "cancelada") y, al recibirse, fecha y cantidad recibidas.
- **Movimiento_de_Inventario**: Registro inmodificable de un cambio en la cantidad de un Producto, de tipo "entrada", "salida" o "ajuste".
- **Medicamento**: Producto de categoría medicamento, con tipo ("genérico" o "de patente"), principio activo, clasificación de control e indicador de receta requerida, solo con fines de demostración.
- **Medicamento_Controlado**: Medicamento cuya clasificación de control es "controlado".
- **Equipo_Médico**: Equipo del hospital con nombre, categoría, departamento, cantidad, ubicación, estado operativo e indicador de mantenimiento requerido.
- **Estado_Operativo**: Valor "disponible", "en uso", "en mantenimiento" o "fuera de servicio".
- **Registro_de_Mantenimiento**: Registro de una reparación o mantenimiento de un Equipo_Médico, con tipo, fechas, descripción y técnico.
- **Habitación**: Espacio físico de internación perteneciente a un Departamento.
- **Disponibilidad_de_Habitación**: Valor "disponible" u "ocupada", derivado de las asignaciones activas.
- **Asignación**: Vínculo entre un Paciente y una Habitación, con fecha de inicio y, al cerrarse, fecha de fin y Motivo_de_Liberación.
- **Motivo_de_Liberación**: Causa del cierre de una Asignación: "alta" o "fallecimiento".
- **Historial_de_Ocupación**: Lista de todas las Asignaciones, activas y cerradas, consultable por Departamento.
- **Evento**: Entrada de calendario con título, fecha, tipo y color.
- **Tipo_de_Evento**: Clasificación del Evento: general, actividad, entrega, cumpleaños, agenda individual, día inhábil o feriado.
- **Día_Inhábil**: Fecha propia del hospital, registrada por el Administrador, en la que no hay actividad laboral ordinaria.
- **Calendario_de_Turnos**: Calendario generado que muestra, por día, los Empleados del Turno matutino y del Turno vespertino con sus horas de entrada y salida.
- **Bitácora_de_Auditoría**: Registro persistente de accesos y modificaciones sensibles con usuario, acción, entidad, fecha y hora.
- **Nager.Date**: Servicio público gratuito de feriados, usado de forma opcional y sin claves privadas.
- **Datos_Demo**: Datos ficticios cargados mediante semilla en la Base_de_Datos.

## Requirements

### Requirement 1: Autenticación basada en sesiones

**User Story:** Como Usuario, quiero iniciar y cerrar sesión con mi propia cuenta, para acceder de forma segura a las funciones que me corresponden.

#### Acceptance Criteria

1. WHEN un Usuario envía credenciales válidas, THE Backend SHALL crear una Sesión y devolver una cookie de sesión con los atributos HttpOnly y SameSite=Strict.
2. IF un Usuario envía credenciales inválidas, THEN THE Backend SHALL responder con código 401, un mensaje genérico en español que no indique cuál credencial es incorrecta, y SHALL no crear ninguna Sesión ni cookie de sesión.
3. THE Backend SHALL almacenar las contraseñas de los Usuarios únicamente como hash generado con bcrypt, sin almacenar ni registrar la contraseña en texto plano.
4. WHEN un Usuario solicita cerrar sesión, THE Backend SHALL invalidar la Sesión en el servidor y eliminar la cookie de sesión, de modo que cualquier solicitud posterior con esa cookie reciba código 401.
5. WHEN una Sesión permanece sin actividad durante 30 minutos, THE Backend SHALL invalidar la Sesión, de modo que la siguiente solicitud con esa cookie reciba código 401.
6. IF una solicitud a un recurso protegido no incluye una Sesión válida, THEN THE Backend SHALL responder con código 401 y no devolver datos del recurso.
7. THE Sistema SHALL asociar cada cuenta de Usuario a una contraseña propia, sin contraseña maestra ni credencial compartida entre cuentas, y sin almacenar ninguna contraseña en texto plano en el código fuente, la configuración, la semilla ni la Base_de_Datos.
8. WHEN un Usuario autenticado solicita cambiar su contraseña con la contraseña actual correcta y una nueva contraseña de entre 8 y 128 caracteres, THE Backend SHALL actualizar el hash de la contraseña y conservar la Sesión actual.
9. IF un Usuario autenticado solicita cambiar su contraseña con una contraseña actual incorrecta o con una nueva contraseña fuera del rango de 8 a 128 caracteres, THEN THE Backend SHALL rechazar la solicitud con un mensaje en español que indique el motivo del rechazo y conservar el hash de la contraseña sin cambios.
10. IF un Usuario envía 5 intentos de inicio de sesión fallidos consecutivos desde la misma dirección en 15 minutos, THEN THE Backend SHALL rechazar nuevos intentos con código 429 durante 15 minutos, incluso si las credenciales enviadas son válidas.
11. WHEN un Usuario cambia su contraseña con éxito, THE Backend SHALL invalidar todas las demás Sesiones de ese Usuario y registrar el cambio en la Bitácora_de_Auditoría.

### Requirement 2: Control de acceso por roles

**User Story:** Como Administrador, quiero que cada Rol acceda solo a lo permitido, para proteger la información del hospital.

#### Acceptance Criteria

1. WHEN el Backend recibe una solicitud a un recurso protegido, THE Backend SHALL verificar el Rol del Usuario autenticado antes de ejecutar la operación solicitada.
2. IF una solicitud a un recurso protegido no incluye una Sesión válida o la Sesión ha expirado, THEN THE Backend SHALL rechazar la solicitud con código 401, sin ejecutar la operación y sin revelar datos del recurso.
3. WHERE el Usuario tiene el Rol Administrador, THE Sistema SHALL conceder acceso de consulta y gestión (crear, consultar, modificar y eliminar) a todos los módulos, con la condición de que el acceso a Documentos_de_Empleado requiera una Autorización_Administrativa vigente según el Requisito 18.
4. WHERE el Usuario tiene el Rol Médico, THE Sistema SHALL conceder acceso únicamente a su propio Perfil, a sus propios Documentos_de_Empleado, a su propia agenda y a los Pacientes para los cuales figura como médico responsable.
5. WHERE el Usuario tiene el Rol Enfermero, THE Sistema SHALL conceder acceso únicamente a su propio Perfil, a sus propios Documentos_de_Empleado, a su propia agenda y a los Pacientes para los cuales figura como enfermero responsable.
6. WHERE el Usuario tiene el Rol Personal_de_Limpieza, THE Sistema SHALL conceder acceso únicamente a su propio Perfil, a sus propios Documentos_de_Empleado, a su propia agenda y a la consulta del Módulo_Inventario_Limpieza.
7. IF un Usuario autenticado solicita un recurso que su Rol no permite, THEN THE Backend SHALL responder con código 403, sin ejecutar la operación y sin incluir en la respuesta datos del recurso.
8. WHEN el Frontend muestra el menú lateral, THE Frontend SHALL mostrar únicamente las opciones de los módulos permitidos para el Rol de la Sesión y ninguna opción de módulos no permitidos.
9. IF un Usuario navega en el Frontend a una ruta no permitida para su Rol, THEN THE Frontend SHALL redirigir al Usuario a su página de inicio en un máximo de 1 segundo y mostrar un mensaje en español indicando acceso denegado.
10. THE Sistema SHALL asignar exactamente un Rol a cada cuenta de Usuario, y IF se intenta asignar un segundo Rol a una cuenta, THEN THE Sistema SHALL rechazar la operación conservando el Rol existente e indicando el error al solicitante.

### Requirement 3: Validación de datos

**User Story:** Como Usuario, quiero que los formularios validen mis datos, para evitar registros incorrectos.

#### Acceptance Criteria

1. WHEN un Usuario envía un formulario, THE Frontend SHALL validar que los campos obligatorios no estén vacíos ni contengan solo espacios, que cada valor coincida con el tipo definido para el campo y que esté dentro de los rangos y longitudes máximas definidos para el campo, antes de enviar la solicitud al Backend.
2. IF la validación del Frontend detecta uno o más errores, THEN THE Frontend SHALL impedir el envío de la solicitud al Backend, conservar los valores ingresados en el formulario y mostrar el mensaje de error junto a cada campo afectado en un máximo de 500 ms.
3. WHEN el Backend recibe una solicitud con datos, THE Backend SHALL validar campos obligatorios, tipos, longitudes y rangos, independientemente de la validación del Frontend.
4. IF una solicitud contiene datos inválidos, THEN THE Backend SHALL responder con código 400, una lista de errores en la que cada elemento identifica el campo y describe el error en español, y SHALL NOT crear ni modificar ningún registro en la Base_de_Datos.
5. IF el Backend responde con código 400 y una lista de errores por campo, THEN THE Frontend SHALL mostrar cada mensaje de error junto al campo afectado y conservar los valores ingresados en el formulario.
6. THE Backend SHALL utilizar consultas parametrizadas mediante Prisma ORM para todas las operaciones sobre la Base_de_Datos.
7. IF una solicitud intenta crear un registro con un ID interno ya existente, THEN THE Backend SHALL responder con código 409, no modificar el registro existente y devolver un mensaje de error en español que indique que el ID ya existe.
8. IF el Backend responde con código 409, THEN THE Frontend SHALL mostrar el mensaje de error recibido junto al campo del ID interno y conservar los valores ingresados en el formulario.

### Requirement 4: Dashboard administrativo

**User Story:** Como Administrador, quiero un panel con estadísticas e indicadores clave, para conocer el estado del hospital de un vistazo.

#### Acceptance Criteria

1. WHEN un Administrador abre el Módulo_Dashboard, THE Frontend SHALL mostrar seis tarjetas, una por cada estadística: número de empleados, número de Pacientes activos, número de habitaciones disponibles, número de habitaciones ocupadas, número de Productos con Stock_Bajo (de ambos inventarios) y número de Equipos_Médicos en mantenimiento, cada una con un valor entero mayor o igual a 0.
2. WHEN un Administrador abre el Módulo_Dashboard, THE Frontend SHALL mostrar las entregas (incluidas las Entregas_de_Proveedor con estado "programada") y actividades con fecha desde el día actual hasta 7 días naturales posteriores (inclusive), ordenadas por fecha ascendente, con un máximo de 50 elementos.
3. IF no existen entregas ni actividades en los próximos 7 días, THEN THE Frontend SHALL mostrar un mensaje indicando que no hay entregas ni actividades programadas, en lugar de la lista.
4. THE Backend SHALL calcular cada estadística e indicador del Módulo_Dashboard a partir de los datos de la Base_de_Datos vigentes en el momento de cada solicitud, sin utilizar valores almacenados de solicitudes anteriores.
5. WHEN cambia un dato que afecta una estadística, THE Módulo_Dashboard SHALL mostrar el valor actualizado en la siguiente carga del panel, sin requerir intervención adicional del Administrador.
6. IF el Backend no puede calcular las estadísticas o indicadores del Módulo_Dashboard o la solicitud supera los 10 segundos, THEN THE Frontend SHALL mostrar un mensaje de error indicando que no fue posible cargar el panel, sin mostrar valores parciales ni desactualizados en las tarjetas ni en los indicadores.
7. IF un Usuario con Rol distinto de Administrador solicita las estadísticas del Módulo_Dashboard, THEN THE Backend SHALL responder con código 403 sin incluir ninguna estadística en la respuesta.
8. WHERE el Frontend se muestra en pantalla de ancho menor a 768 píxeles, THE Frontend SHALL ordenar las tarjetas de estadísticas en una sola columna.
9. WHEN un Administrador abre el Módulo_Dashboard, THE Backend SHALL calcular además los siguientes indicadores: número de Pacientes dados de alta, número de Pacientes fallecidos, número de Equipos_Médicos fuera de servicio, número de Productos agotados y, por cada Departamento, el número de Habitaciones ocupadas, el número total de Habitaciones y el porcentaje de ocupación como entero de 0 a 100.
10. WHEN el Frontend recibe los indicadores del criterio 9, THE Frontend SHALL mostrar el porcentaje de ocupación de cada Departamento con una barra de progreso acompañada del valor numérico en texto.

### Requirement 5: Gestión de personal

**User Story:** Como Administrador, quiero gestionar los Perfiles de los Empleados, para mantener actualizada la información del personal.

#### Acceptance Criteria

1. WHEN el Sistema se inicializa con la Base_de_Datos vacía, THE Sistema SHALL cargar exactamente 10 Empleados demo, con al menos 2 Médicos, 2 Enfermeros y 2 miembros de Personal_de_Limpieza.
2. THE Sistema SHALL almacenar para cada Empleado: foto, nombre (1 a 100 caracteres), Correo_Electrónico único, ID interno único, cargo (1 a 100 caracteres), descripción (0 a 500 caracteres), especialidad (1 a 100 caracteres), Departamento, años de experiencia (entero de 0 a 60), Turno, Horario_de_Trabajo y teléfono.
3. WHEN un Administrador solicita la lista de Empleados, THE Backend SHALL devolver todos los Empleados que cumplan los filtros opcionales por Rol, Departamento y Turno, y la búsqueda opcional por nombre o ID interno sin distinguir mayúsculas, combinados con AND, y una lista vacía si ninguno coincide, en un máximo de 2 segundos para hasta 500 Empleados.
4. WHEN un Administrador crea, edita o elimina un Empleado con datos válidos, THE Backend SHALL guardar el cambio en la Base_de_Datos y devolver el Empleado resultante, o la confirmación de eliminación, en un máximo de 2 segundos.
5. IF un Administrador envía datos inválidos al crear o editar un Empleado (campo obligatorio vacío, longitud o rango excedido, Correo_Electrónico con formato inválido, o ID interno o Correo_Electrónico duplicado), THEN THE Backend SHALL responder con código 400 (409 si el ID interno o el Correo_Electrónico está duplicado) y un mensaje en español que indique el campo inválido, sin modificar la Base_de_Datos.
6. WHEN un Empleado solicita su Perfil, THE Backend SHALL devolver únicamente el Perfil de ese Empleado.
7. WHEN un Empleado edita su propio Perfil, THE Backend SHALL permitir modificar únicamente foto, teléfono, contraseña y Horario_de_Trabajo, y guardar el cambio en la Base_de_Datos.
8. IF un Empleado intenta modificar su cargo, descripción, Correo_Electrónico, ID interno, Departamento, Rol, años de experiencia o Turno, THEN THE Backend SHALL responder con código 403 y dejar el Perfil sin cambios.
9. IF un Empleado solicita el Perfil de otro Empleado, THEN THE Backend SHALL responder con código 403 sin devolver datos del otro Perfil.
10. IF un Administrador intenta eliminar un Empleado con Pacientes activos asignados, THEN THE Backend SHALL responder con código 409 y un mensaje en español que indique la causa, conservando el Empleado en la Base_de_Datos.
11. IF un Administrador intenta eliminar su propia cuenta, THEN THE Backend SHALL responder con código 409 y un mensaje en español que indique la causa, conservando la cuenta en la Base_de_Datos.
12. WHEN un Administrador crea un Empleado, THE Backend SHALL crear una cuenta de Usuario con una contraseña inicial única generada para esa cuenta, y exigir su cambio en el primer inicio de sesión antes de permitir cualquier otra operación.
13. WHEN un Administrador o un Empleado carga una foto de Perfil, THE Backend SHALL aceptar únicamente archivos JPEG o PNG de hasta 2 MB cuya firma de archivo coincida con el formato declarado, y SHALL asignar una imagen ilustrativa ficticia por defecto a los Perfiles sin foto cargada.
14. IF una foto de Perfil no es JPEG ni PNG, excede 2 MB o tiene una firma de archivo que no coincide con el formato declarado, THEN THE Backend SHALL responder con código 400 y conservar la foto anterior.
15. WHEN un Administrador o un Empleado guarda el Horario_de_Trabajo de un día, THE Backend SHALL validar que cada hora tenga el formato HH:mm, que la hora de salida sea posterior a la hora de entrada, que el periodo de comida (inicio y fin) esté dentro del intervalo de entrada a salida, que cada Descanso (inicio y fin, con un máximo de 3 por día) esté dentro del intervalo de entrada a salida, y que ni los Descansos entre sí ni los Descansos con la comida se solapen.
16. IF el Horario_de_Trabajo de un día incumple alguna regla del criterio 15, THEN THE Backend SHALL responder con código 400 indicando el campo inválido y conservar el Horario_de_Trabajo anterior.
17. WHEN un Administrador abre el detalle del Perfil de otro Empleado, THE Backend SHALL registrar la consulta en la Bitácora_de_Auditoría.

### Requirement 6: Gestión de pacientes

**User Story:** Como Administrador, quiero registrar y consultar Pacientes, para llevar el control de la hospitalización.

#### Acceptance Criteria

1. THE Sistema SHALL cargar exactamente 12 Pacientes ficticios como Datos_Demo.
2. THE Sistema SHALL almacenar para cada Paciente: ID interno único, datos generales, fecha de ingreso más reciente, motivo general de hospitalización (1 a 500 caracteres), Departamento, médico responsable, enfermero responsable, Observación_Médica (0 a 1000 caracteres), Observación_de_Enfermería (0 a 1000 caracteres), fecha y hora de fallecimiento (solo si el estado es "fallecido"), Tratamientos_Programados (0 a 100 por Paciente, incluidos los realizados y cancelados) y Estado_del_Paciente.
3. WHEN un Administrador crea o edita un Paciente con datos válidos, THE Backend SHALL guardar el cambio en la Base_de_Datos y devolver el Paciente guardado en un máximo de 2 segundos.
4. IF un Administrador crea o edita un Paciente con datos obligatorios ausentes, con un Departamento inexistente o con un campo que excede su longitud máxima, THEN THE Backend SHALL rechazar la solicitud con código 400, indicar los campos inválidos y conservar sin cambios los datos previos del Paciente.
5. WHEN un Administrador solicita la lista de Pacientes, THE Backend SHALL devolver los Pacientes que cumplan todos los filtros opcionales indicados (Estado_del_Paciente, Departamento y búsqueda por nombre o ID interno, sin distinguir mayúsculas), ordenados por fecha de ingreso descendente y paginados según el Requisito 13.
6. WHEN un Médico o Enfermero solicita la lista de Pacientes, THE Backend SHALL devolver únicamente los Pacientes para los cuales ese Empleado figura como médico responsable o enfermero responsable, respectivamente.
7. IF un Médico o Enfermero solicita un Paciente para el cual no figura como médico o enfermero responsable, THEN THE Backend SHALL responder con código 403 sin incluir datos del Paciente.
8. WHEN un Administrador asigna un médico responsable, THE Backend SHALL aceptar únicamente Empleados con Rol Médico.
9. WHEN un Administrador asigna un enfermero responsable, THE Backend SHALL aceptar únicamente Empleados con Rol Enfermero.
10. IF un Administrador asigna como médico o enfermero responsable a un Empleado que no tiene el Rol requerido o que no existe, THEN THE Backend SHALL rechazar la solicitud con código 400 y conservar la asignación previa.
11. WHEN un Administrador o el Médico responsable registra un Tratamiento_Programado con tipo, fecha válida y descripción de 1 a 500 caracteres, THE Backend SHALL asociarlo al Paciente y, mientras su estado sea "programado", mostrarlo en el calendario correspondiente a esa fecha.
12. IF un Usuario con Rol Personal_de_Limpieza solicita datos de Pacientes, THEN THE Backend SHALL responder con código 403 sin incluir datos de Pacientes.
13. WHEN el Estado_del_Paciente cambia a "dado de alta" o "fallecido", THE Backend SHALL cerrar la Asignación activa del Paciente con el Motivo_de_Liberación "alta" o "fallecimiento" respectivamente, agregar el Registro_de_Movimiento_del_Paciente correspondiente y registrar la operación en la Bitácora_de_Auditoría con Usuario, fecha y hora, Paciente y nuevo estado.
14. IF la fecha de ingreso de un Paciente es posterior a la fecha actual, THEN THE Backend SHALL rechazar la solicitud con código 400 y no guardar el cambio.
15. THE Sistema SHALL excluir de su alcance diagnósticos automatizados, recetas médicas reales e historias clínicas completas.

### Requirement 7: Gestión de inventario

**User Story:** Como Administrador, quiero controlar el inventario, para detectar faltantes y gestionar proveedores.

#### Acceptance Criteria

1. THE Sistema SHALL cargar 20 Productos demo, con al menos 5 Productos en cada una de las categorías insumo médico, medicamento y material de limpieza.
2. THE Sistema SHALL almacenar para cada Producto: nombre (1 a 100 caracteres), categoría, clasificación (1 a 50 caracteres; la Subcategoría_de_Insumo para insumo médico, el tipo para medicamento y un texto libre para material de limpieza), cantidad (entero de 0 a 999,999), Stock_Mínimo (entero de 0 a 999,999), disponibilidad y un Proveedor.
3. WHEN la cantidad de un Producto es menor o igual a su Stock_Mínimo, THE Sistema SHALL marcar el Producto con Stock_Bajo.
4. WHEN la cantidad de un Producto es igual a cero, THE Sistema SHALL establecer su disponibilidad como "agotado".
5. THE Sistema SHALL almacenar para cada Medicamento, solo con fines de demostración, los datos definidos en el Requisito 22.
6. WHEN un Administrador crea, edita o elimina un Producto con datos válidos, THE Backend SHALL guardar el cambio en la Base_de_Datos y devolver el Producto resultante, o una confirmación en caso de eliminación.
7. WHEN un Administrador ajusta la cantidad de un Producto, THE Backend SHALL registrar en la Bitácora_de_Auditoría una entrada con el usuario, el Producto, la cantidad anterior, la cantidad nueva y la fecha y hora de la operación, y SHALL registrar el Movimiento_de_Inventario correspondiente según el Requisito 25.
8. IF una solicitud de creación o edición establece una cantidad o Stock_Mínimo negativos, no enteros o mayores a 999,999, THEN THE Backend SHALL responder con código 400 con un mensaje que indique el campo inválido y SHALL conservar sin cambios el Producto en la Base_de_Datos.
9. WHEN un Administrador solicita la lista de Productos del Módulo_Inventario, THE Backend SHALL devolver los Productos de categoría insumo médico y medicamento que cumplan todos los filtros opcionales indicados (categoría, Subcategoría_de_Insumo, disponibilidad, Stock_Bajo y Proveedor), o todos esos Productos si no se indica ningún filtro.
10. WHEN un Usuario con Rol Personal_de_Limpieza solicita la lista del Módulo_Inventario_Limpieza, THE Backend SHALL devolver únicamente los Productos de categoría material de limpieza.
11. IF un Médico o Enfermero solicita el Módulo_Inventario o el Módulo_Inventario_Limpieza, THEN THE Backend SHALL responder con código 403 y no devolver datos de Productos.
12. THE Sistema SHALL almacenar para cada Proveedor: nombre (1 a 100 caracteres), contacto ficticio, la lista de Productos que suministra y su historial de Entregas_de_Proveedor.
13. IF un Administrador crea o edita un Producto con un Proveedor inexistente o con un campo obligatorio vacío, THEN THE Backend SHALL responder con código 400 con un mensaje que indique el campo inválido y SHALL conservar sin cambios la Base_de_Datos.

### Requirement 8: Gestión de equipos médicos

**User Story:** Como Administrador, quiero registrar el estado de los equipos médicos, para planificar su mantenimiento.

#### Acceptance Criteria

1. THE Sistema SHALL cargar 12 Equipos_Médicos demo distribuidos entre los Departamentos, con al menos 1 Equipo_Médico por Departamento existente y al menos 1 Equipo_Médico en cada Estado_Operativo.
2. THE Sistema SHALL almacenar para cada Equipo_Médico: nombre (1 a 100 caracteres), categoría (1 a 50 caracteres), Departamento, cantidad (entero de 1 a 9999), ubicación (1 a 100 caracteres), Estado_Operativo (disponible, en uso, en mantenimiento o fuera de servicio) e indicador de mantenimiento requerido (booleano).
3. WHEN un Administrador crea, edita o elimina un Equipo_Médico con datos válidos, THE Backend SHALL guardar el cambio en la Base_de_Datos y devolver una respuesta de éxito que refleje el estado resultante del Equipo_Médico.
4. IF una solicitud de creación o edición de un Equipo_Médico omite un campo obligatorio, excede la longitud máxima de un campo, referencia un Departamento inexistente o contiene un Estado_Operativo no definido, THEN THE Backend SHALL responder con código 400 y conservar sin cambios los datos almacenados.
5. IF una solicitud de edición o eliminación referencia un Equipo_Médico que no existe, THEN THE Backend SHALL responder con código 404 y conservar sin cambios los datos almacenados.
6. WHEN un Administrador solicita la lista de Equipos_Médicos, THE Backend SHALL devolver los equipos que cumplan simultáneamente todos los filtros opcionales indicados por Departamento, categoría y Estado_Operativo, o todos los equipos si no se indica ningún filtro, y una lista vacía si ninguno coincide.
7. WHEN un Administrador cambia el Estado_Operativo de un Equipo_Médico, THE Backend SHALL registrar en la Bitácora_de_Auditoría una entrada con el usuario, la fecha y hora, el Equipo_Médico, el Estado_Operativo anterior y el nuevo.
8. WHEN un Administrador cambia el Estado_Operativo de un Equipo_Médico a "en mantenimiento", THE Módulo_Dashboard SHALL incluirlo en el conteo de equipos en mantenimiento en la siguiente consulta del dashboard.
9. IF una solicitud establece una cantidad menor que 1, mayor que 9999 o no entera para un Equipo_Médico, THEN THE Backend SHALL responder con código 400 y conservar sin cambios los datos almacenados.
10. IF un Usuario con Rol distinto de Administrador solicita el Módulo_Equipos, THEN THE Backend SHALL responder con código 403 y no devolver ni modificar datos de Equipos_Médicos.
11. WHEN un Administrador abre el Módulo_Equipos, THE Frontend SHALL mostrar los Equipos_Médicos agrupados por Departamento, con el nombre del Departamento y el número de equipos de cada grupo.

### Requirement 9: Gestión de habitaciones

**User Story:** Como Administrador, quiero asignar Pacientes a Habitaciones y registrar su liberación, para conocer la ocupación en tiempo real.

#### Acceptance Criteria

1. THE Sistema SHALL cargar 20 Habitaciones demo, con al menos 1 Habitación por Departamento existente, y con una capacidad de 1 a 10 Pacientes por Habitación.
2. THE Sistema SHALL almacenar para cada Habitación: número único (entero de 1 a 9999), Departamento, capacidad (entero de 1 a 10) y Disponibilidad_de_Habitación con valor "disponible" u "ocupada".
3. WHEN un Administrador asigna un Paciente con Estado_del_Paciente "activo" y sin Asignación activa a una Habitación con Disponibilidad_de_Habitación "disponible", THE Backend SHALL crear la Asignación con la fecha y hora de inicio, y SHALL establecer la Disponibilidad_de_Habitación en "ocupada" cuando la cantidad de Asignaciones activas sea igual a la capacidad.
4. WHEN un Administrador registra la liberación de un Paciente con Asignación activa indicando el Motivo_de_Liberación "alta" o "fallecimiento", THE Backend SHALL cerrar la Asignación con la fecha y hora de fin y el Motivo_de_Liberación, cambiar el Estado_del_Paciente a "dado de alta" o "fallecido" respectivamente, agregar el Registro_de_Movimiento_del_Paciente correspondiente y establecer la Disponibilidad_de_Habitación en "disponible" si la cantidad de Asignaciones activas resultante es menor que la capacidad.
5. IF un Administrador asigna un Paciente a una Habitación con Disponibilidad_de_Habitación "ocupada", THEN THE Backend SHALL responder con código 409, con un error que indique que la Habitación está ocupada, y SHALL conservar sin cambios las Asignaciones existentes.
6. IF un Administrador asigna un Paciente que ya tiene una Asignación activa, THEN THE Backend SHALL responder con código 409, con un error que indique que el Paciente ya tiene una Asignación activa, y SHALL conservar sin cambios las Asignaciones existentes.
7. IF un Administrador asigna un Paciente con Estado_del_Paciente distinto de "activo", THEN THE Backend SHALL responder con código 409, con un error que indique que el Paciente no está activo, y SHALL no crear ninguna Asignación.
8. IF un Administrador registra la liberación de un Paciente sin Asignación activa, THEN THE Backend SHALL responder con código 409, con un error que indique que no existe una Asignación activa, y SHALL conservar sin cambios el Estado_del_Paciente.
9. THE Backend SHALL calcular la Disponibilidad_de_Habitación a partir de la cantidad de Asignaciones activas y la capacidad: "ocupada" si la cantidad es igual a la capacidad y "disponible" en cualquier otro caso.
10. WHEN un Administrador solicita la lista de Habitaciones, THE Backend SHALL devolver las Habitaciones con filtros opcionales por Departamento y Disponibilidad_de_Habitación combinables entre sí, e incluir para cada Habitación los Pacientes con Asignación activa, en un tiempo máximo de 2 segundos para hasta 100 Habitaciones.
11. WHEN un Administrador registra una asignación o una liberación, THE Backend SHALL registrar en la Bitácora_de_Auditoría el tipo de operación, el identificador del Administrador, el identificador del Paciente, el identificador de la Habitación, el Motivo_de_Liberación cuando aplique y la fecha y hora de la operación.
12. IF un Usuario con Rol distinto de Administrador solicita la gestión del Módulo_Habitaciones, THEN THE Backend SHALL responder con código 403 y SHALL no ejecutar la operación solicitada.
13. IF un Administrador indica un Motivo_de_Liberación distinto de "alta" o "fallecimiento", THEN THE Backend SHALL responder con código 400 y conservar sin cambios la Asignación y el Estado_del_Paciente.

### Requirement 10: Calendarios y agendas

**User Story:** Como Usuario, quiero ver calendarios con eventos diferenciados por color, para organizar actividades, entregas y mi trabajo.

#### Acceptance Criteria

1. THE Módulo_Calendarios SHALL ofrecer cinco calendarios: el calendario general del hospital, el calendario de actividades y entregas, el calendario de cumpleaños del personal, el Calendario_de_Turnos y la agenda de trabajo individual.
2. THE Frontend SHALL mostrar cada Tipo_de_Evento con un color distinto del resto de los Tipos_de_Evento y una leyenda de colores que lista todos los Tipos_de_Evento visibles en el calendario activo.
3. WHEN un Administrador crea, edita o elimina un Evento de tipo general, actividad o entrega con datos válidos, THE Backend SHALL guardar el cambio en la Base_de_Datos y responder con confirmación de éxito en un máximo de 2 segundos.
4. IF un Administrador envía un Evento de tipo general, actividad o entrega con título vacío, título de más de 150 caracteres o fecha de inicio o fin ausente, THEN THE Backend SHALL responder con código 400, indicar el campo inválido y conservar sin cambios los datos existentes en la Base_de_Datos.
5. WHEN se consulta el calendario de cumpleaños, THE Backend SHALL generar un evento de cumpleaños por cada Empleado activo con fecha de nacimiento registrada, ubicado en el día y mes de dicha fecha de nacimiento, para cada año consultado.
6. WHEN un Empleado abre su agenda individual, THE Frontend SHALL mostrar su Horario_de_Trabajo (entrada, salida, comida y Descansos de cada día), sus Eventos personales y, si el Empleado es Médico o Enfermero, los Tratamientos_Programados con estado "programado" de sus Pacientes asignados, en un máximo de 3 segundos.
7. WHEN un Empleado crea, edita o elimina un Evento personal con datos válidos en su agenda, THE Backend SHALL guardar el cambio en la Base_de_Datos.
8. IF un Empleado intenta crear, editar o eliminar un Evento en la agenda individual de otro Empleado, THEN THE Backend SHALL responder con código 403 y conservar sin cambios los datos de esa agenda.
9. IF un Evento tiene una fecha de fin anterior a su fecha de inicio, THEN THE Backend SHALL responder con código 400 y no guardar el Evento.
10. WHERE el Usuario es Administrador, THE Módulo_Calendarios SHALL permitir consultar la agenda individual de cualquier Empleado.
11. WHEN un Usuario cambia la vista del calendario entre mes y semana, THE Frontend SHALL mostrar los Eventos cuyo período se solapa con el mes o la semana seleccionados, en un máximo de 2 segundos.

### Requirement 11: Feriados mediante Nager.Date

**User Story:** Como Usuario, quiero ver feriados públicos en el calendario, para planificar mejor sin que el Sistema dependa de un servicio externo.

#### Acceptance Criteria

1. WHERE la integración con Nager.Date está habilitada, WHEN el Frontend solicita los feriados de un año entre 1900 y 2100, THE Backend SHALL consultar los feriados públicos de ese año en Nager.Date sin utilizar claves privadas ni servicios de pago.
2. WHEN el Backend devuelve una lista de feriados de Nager.Date, THE Frontend SHALL mostrar cada feriado en la fecha correspondiente del calendario general con un color distinto al de cualquier otro tipo de evento del calendario.
3. IF Nager.Date no responde en 3 segundos o responde con error, THEN THE Backend SHALL devolver una lista de feriados vacía, indicar en la respuesta que los feriados no están disponibles y mantener operativas el resto de las funcionalidades del calendario.
4. IF el Backend indica que los feriados no están disponibles, THEN THE Frontend SHALL mostrar un aviso en español con el texto indicando que los feriados no están disponibles, sin bloquear la interacción con el calendario, y conservar los demás eventos visibles, incluidos los Días_Inhábiles.
5. WHEN el Backend obtiene correctamente los feriados de un año, THE Backend SHALL guardarlos en memoria durante 24 horas y atender las solicitudes de ese mismo año dentro de ese período sin consultar Nager.Date.
6. IF el año solicitado está fuera del rango de 1900 a 2100 o no es un número entero, THEN THE Backend SHALL rechazar la solicitud con un error indicando que el año es inválido, sin consultar Nager.Date.

### Requirement 12: Bitácora de auditoría

**User Story:** Como Administrador, quiero un historial de accesos y modificaciones sensibles, para tener trazabilidad de los cambios.

#### Acceptance Criteria

1. WHEN un Usuario ejecuta con éxito una operación sensible de las definidas en el criterio 2, THE Backend SHALL registrar en la Bitácora_de_Auditoría un registro con el identificador del usuario (ausente cuando la acción no corresponde a una cuenta identificable), el nombre de la acción, el tipo de entidad afectada, el identificador de la entidad, y la fecha y hora en formato UTC con precisión de segundos, dentro de la misma transacción que la operación.
2. THE Sistema SHALL considerar operaciones sensibles únicamente: inicios de sesión exitosos y fallidos; solicitudes y restablecimientos de contraseña; cambios de contraseña; otorgamiento y rechazo de Autorizaciones_Administrativas; consulta, descarga, carga, reemplazo y eliminación de Documentos_de_Empleado; consulta del detalle del Perfil de otro Empleado por un Administrador; creación de Empleados, eliminación de Empleados y modificación de Perfiles por un Administrador; cambios de Rol; cambios de Estado_del_Paciente, ingresos y reingresos de Pacientes; asignaciones y liberaciones de Habitaciones; Movimientos_de_Inventario; recepciones y cancelaciones de Entregas_de_Proveedor; cambios de Estado_Operativo de Equipos_Médicos; y registros de mantenimiento.
3. WHEN un Administrador abre la Bitácora_de_Auditoría, THE Frontend SHALL mostrar los registros ordenados por fecha y hora de más reciente a más antiguo, paginados según el Requisito 13, y SHALL ofrecer filtros por usuario, por acción y por rango de fechas (fecha inicial y fecha final inclusivas).
4. WHEN un Administrador aplica uno o más filtros en la Bitácora_de_Auditoría, THE Frontend SHALL mostrar únicamente los registros que cumplen todos los filtros aplicados, y IF ningún registro cumple los filtros, THEN THE Frontend SHALL mostrar un mensaje indicando que no hay resultados.
5. IF un Usuario con Rol distinto de Administrador solicita la Bitácora_de_Auditoría, THEN THE Backend SHALL responder con código 403 sin devolver ningún registro.
6. THE Backend SHALL excluir contraseñas, hashes de contraseñas, Tokens_de_Recuperación, Autorizaciones_Administrativas y tokens de sesión de todos los registros de la Bitácora_de_Auditoría.
7. THE Backend SHALL ofrecer la Bitácora_de_Auditoría únicamente con operaciones de lectura y de creación de registros, y SHALL rechazar cualquier solicitud de edición o eliminación de registros con código 405.
8. IF el registro en la Bitácora_de_Auditoría falla, THEN THE Backend SHALL revertir la operación sensible asociada sin conservar cambios parciales, y SHALL responder con código 500 y un mensaje de error que indique que la operación no se completó.
9. IF el registro en la Bitácora_de_Auditoría falla durante la consulta o descarga de un Documento_de_Empleado, THEN THE Backend SHALL denegar la entrega del documento, responder con código 500 y no incluir datos del documento en la respuesta.

### Requirement 13: API REST propia

**User Story:** Como desarrollador, quiero una API REST consistente, para que el Frontend realice todas las operaciones contra la Base_de_Datos.

#### Acceptance Criteria

1. THE API SHALL exponer endpoints REST para cada uno de los siguientes recursos: autenticación, recuperación de contraseña, autorización administrativa, personal, documentos de empleados, pacientes, historial de pacientes, inventario, inventario de limpieza, proveedores, entregas de proveedores, movimientos de inventario, equipos médicos, mantenimiento de equipos, habitaciones, historial de ocupación, eventos, días inhábiles, calendario de turnos, dashboard, feriados y auditoría.
2. WHEN la API recibe una solicitud con método GET, POST, PUT, PATCH o DELETE que se procesa correctamente, THE API SHALL responder con código 200 para lecturas y actualizaciones, 201 para creaciones y 204 para eliminaciones sin contenido.
3. THE API SHALL aceptar y devolver cuerpos de solicitud y respuesta en formato JSON codificado en UTF-8, con excepción de la carga de fotos y documentos, que usa multipart, y de la descarga de documentos, que devuelve application/pdf.
4. IF una solicitud no puede procesarse por validación, autenticación, autorización, recurso inexistente o conflicto, THEN THE API SHALL responder con el código HTTP correspondiente (400, 401, 403, 404 o 409) y un cuerpo JSON con un campo de código de error y un campo de mensaje en español, sin modificar los datos almacenados.
5. WHEN el Frontend ejecuta una operación principal de alta, consulta, modificación o baja sobre cualquiera de los recursos del criterio 1, THE Frontend SHALL realizar la operación mediante una solicitud a la API y mostrar en pantalla los datos devueltos por ella, sin utilizar datos estáticos del cliente.
6. WHEN el cliente solicita una lista de Pacientes, Productos, Movimientos_de_Inventario, Entregas_de_Proveedor, Registros_de_Mantenimiento, Historial_de_Ocupación o registros de auditoría sin indicar el tamaño de página, THE API SHALL devolver un máximo de 10 elementos junto con el número de página actual y el total de elementos.
7. WHERE el cliente indica un tamaño de página en una lista paginada, THE API SHALL aceptar valores de 1 a 100 y, IF el valor está fuera de ese rango o no es un número entero, THEN THE API SHALL responder con código 400 y la estructura de error del criterio 4.
8. IF ocurre un error no controlado durante el procesamiento de una solicitud, THEN THE API SHALL responder con código 500 y un cuerpo JSON con la estructura del criterio 4 y un mensaje genérico en español, sin incluir trazas internas, nombres de archivos ni sentencias de la Base_de_Datos.
9. IF una solicitud proviene de un origen distinto al del Frontend configurado, THEN THE API SHALL rechazarla sin incluir las cabeceras CORS de autorización de origen.
10. WHEN una solicitud proviene del origen del Frontend configurado, THE API SHALL permitir el envío de credenciales y responder a las solicitudes de verificación previa (preflight) en un máximo de 500 ms.

### Requirement 14: Datos demo y persistencia

**User Story:** Como estudiante, quiero datos demo ficticios cargados en SQLite, para probar y presentar el Sistema.

#### Acceptance Criteria

1. WHEN se ejecuta el comando de semilla sobre una Base_de_Datos vacía, THE Sistema SHALL cargar en la Base_de_Datos exactamente 10 Empleados, 12 Pacientes, 20 Productos, 12 Equipos_Médicos, 20 Habitaciones y 6 Departamentos iniciales, además de los registros definidos en el criterio 10.
2. WHEN finaliza el comando de semilla, THE Sistema SHALL tener en la Base_de_Datos un número de registros de cada tipo igual a las cantidades indicadas en los criterios 1 y 10, sin registros adicionales de Datos_Demo.
3. THE Sistema SHALL generar todos los Datos_Demo como ficticios, sin números de documento oficial reales, sin nombres de personas reales identificables, sin correos electrónicos reales (usando un dominio reservado para ejemplos) y sin información médica real de personas.
4. WHEN se ejecuta el comando de semilla una segunda vez o más sobre una Base_de_Datos ya sembrada, THE Sistema SHALL conservar exactamente las mismas cantidades indicadas en los criterios 1 y 10, sin registros duplicados, y SHALL finalizar con código de salida 0.
5. THE Sistema SHALL incluir al menos 1 cuenta de Administrador y al menos 1 cuenta por cada Rol de Empleado, cada una con contraseña individual distinta, documentada únicamente como credencial del entorno de demostración.
6. THE Sistema SHALL persistir en SQLite mediante Prisma ORM el 100% de los datos de las operaciones principales, de modo que los datos permanezcan disponibles tras reiniciar el Sistema.
7. THE Sistema SHALL mantener la integridad referencial entre Empleados, Documentos_de_Empleado, Pacientes, Habitaciones, Asignaciones, Productos, Proveedores, Entregas_de_Proveedor, Movimientos_de_Inventario, Equipos_Médicos, Registros_de_Mantenimiento y Eventos, sin registros que referencien una entidad inexistente.
8. WHEN se ejecuta el comando de semilla, THE Sistema SHALL ubicar cada Paciente activo con Asignación en una Habitación del mismo Departamento que su Asignación.
9. IF el comando de semilla falla durante su ejecución, THEN THE Sistema SHALL revertir todos los cambios de esa ejecución, conservar el estado previo de la Base_de_Datos y mostrar un mensaje de error que indique la causa del fallo.
10. WHEN se ejecuta el comando de semilla sobre una Base_de_Datos vacía, THE Sistema SHALL cargar además: 20 Documentos_de_Empleado (uno de contratación y uno de acreditación por Empleado, con PDF ficticios); 12 Pacientes con 7 en estado "activo", 3 "dado de alta" y 2 "fallecido"; 17 Registros_de_Movimiento_del_Paciente (12 ingresos, 3 altas y 2 fallecimientos); 5 Asignaciones cerradas (3 con Motivo_de_Liberación "alta" y 2 con "fallecimiento"); al menos 12 Tratamientos_Programados, con al menos 2 de tipo "cirugía" y al menos 2 con estado "realizado"; 8 Entregas_de_Proveedor (4 recibidas, 3 programadas y 1 cancelada); 24 Movimientos_de_Inventario (un ajuste inicial por Producto y una entrada por cada Entrega_de_Proveedor recibida); 6 Registros_de_Mantenimiento (4 cerrados y 2 en curso); 3 Días_Inhábiles; y al menos 4 Empleados en cada Turno.

### Requirement 15: Diseño visual y responsivo

**User Story:** Como Usuario, quiero una interfaz profesional e intuitiva en español, para trabajar cómodamente en cualquier dispositivo.

#### Acceptance Criteria

1. THE Frontend SHALL mostrar el 100% de las etiquetas, mensajes, títulos y textos de ayuda de la interfaz en español.
2. THE Frontend SHALL utilizar blanco como color de fondo de las páginas y tonos azules como color predominante de botones, encabezados y elementos activos de navegación.
3. THE Frontend SHALL mostrar un menú lateral de navegación con una entrada por cada módulo al que el Usuario tiene acceso según su rol.
4. WHERE el ancho de pantalla es menor a 768 píxeles, THE Frontend SHALL ocultar el menú lateral por defecto y mostrarlo como panel desplegable al presionar un botón de menú.
5. THE Frontend SHALL mostrar los listados en tablas que permitan ordenar por cualquier columna en sentido ascendente y descendente, y los formularios con una etiqueta visible por cada campo y un mensaje de error junto al campo que no supere la validación.
6. THE Frontend SHALL mostrar un ícono de temática médica en cada entrada del menú lateral y en cada tarjeta de estadísticas.
7. THE Frontend SHALL mostrar los valores de Estado_del_Paciente, Estado_Operativo, Disponibilidad_de_Habitación, Stock_Bajo, estado de Entrega_de_Proveedor y estado de Tratamiento_Programado mediante un indicador con color diferenciado por valor y el texto del valor.
8. THE Frontend SHALL mostrar una foto ilustrativa ficticia en cada Perfil y en la página de inicio de sesión.
9. WHEN el Usuario abre o cierra un menú, abre o cierra un diálogo, o cambia de página, THE Frontend SHALL aplicar una animación con duración máxima de 300 milisegundos.
10. THE Frontend SHALL ser utilizable sin desplazamiento horizontal de la página en anchos de pantalla de escritorio (1280 píxeles o más), tableta (768 a 1279 píxeles) y móvil (320 a 767 píxeles).
11. WHILE una solicitud a la API está en curso, THE Frontend SHALL mostrar un indicador de carga y deshabilitar el botón de envío del formulario que originó la solicitud.
12. IF una solicitud a la API falla, THEN THE Frontend SHALL ocultar el indicador de carga, mostrar un mensaje de error en español que indique la causa del fallo y conservar los datos ingresados en el formulario.
13. WHEN un Administrador solicita eliminar un registro, THE Frontend SHALL mostrar un diálogo de confirmación con las opciones "Confirmar" y "Cancelar" y enviar la solicitud de eliminación únicamente si el Administrador selecciona "Confirmar".
14. THE Frontend SHALL cumplir una relación de contraste mínima de 4.5:1 entre el color del texto y el color de fondo en todo el texto de la interfaz.
15. THE Frontend SHALL ofrecer, en cada listado principal (Personal, Pacientes, Productos, Entregas, Movimientos de inventario, Equipos, Habitaciones, Historial de ocupación y Auditoría), un campo de búsqueda por texto cuando el recurso tenga nombre o ID interno, y los filtros definidos para ese recurso en los requisitos correspondientes.
16. THE Frontend SHALL usar en todos los módulos un único conjunto de componentes visuales (tarjetas, tablas, formularios, botones e insignias de estado) con la misma tipografía, espaciado y paleta.
17. THE Frontend SHALL mostrar cada Perfil en una vista con fotografía circular, nombre, cargo, Departamento, Turno y descripción, y SHALL adaptar esa vista a una columna en pantallas de ancho menor a 768 píxeles.

### Requirement 16: Mantenibilidad y organización del proyecto

**User Story:** Como estudiante Junior Full Stack, quiero una arquitectura simple y organizada, para comprenderla y modificarla con facilidad.

#### Acceptance Criteria

1. THE Sistema SHALL organizar el código en exactamente dos carpetas independientes en la raíz del proyecto, frontend y backend, cada una con su propio archivo de dependencias, de modo que la instalación de dependencias y el inicio de cada carpeta se ejecuten sin requerir archivos de la otra carpeta.
2. THE Backend SHALL separar el código en cuatro capas (rutas, controladores, servicios y acceso a datos mediante Prisma), de modo que ninguna ruta ni controlador importe Prisma directamente y que solo la capa de acceso a datos invoque el cliente de Prisma.
3. THE Frontend SHALL organizar el código en un módulo funcional por cada área de negocio del sistema, con los componentes usados por dos o más módulos ubicados en una carpeta de componentes compartidos.
4. THE Sistema SHALL compilar el Frontend y el Backend con TypeScript en modo estricto (opción `strict` activada), sin errores de compilación y sin uso explícito del tipo `any` en el código fuente propio.
5. THE Sistema SHALL leer el secreto de sesión, la URL de la Base_de_Datos y el origen CORS exclusivamente desde variables de entorno, sin valores sensibles escritos en el código fuente ni en el repositorio.
6. IF una variable de entorno requerida (secreto de sesión, URL de la Base_de_Datos u origen CORS) no está definida al iniciar el Backend, THEN THE Backend SHALL abortar el inicio con un mensaje de error en consola que indique el nombre de la variable faltante y SHALL terminar el proceso con código de salida distinto de cero.
7. THE Sistema SHALL incluir un archivo de ejemplo de variables de entorno que liste los nombres de todas las variables requeridas y opcionales (incluidas las del servidor SMTP), sin valores sensibles reales.
8. THE Sistema SHALL incluir un archivo README en español que contenga, en secciones separadas, las instrucciones de instalación, migración, semilla y ejecución, la forma de consultar los correos de la Bandeja_Local, y la lista de cuentas demo con su rol, de modo que un usuario pueda poner el sistema en marcha siguiendo únicamente esas instrucciones.
9. THE Sistema SHALL ejecutarse completamente en un entorno local, sin requerir servicios de pago, cuentas en servicios externos ni claves privadas, y sin conexión a internet después de instalar las dependencias.
10. THE Sistema SHALL permitir que cada módulo, una vez completado, se ejecute y se verifique de forma independiente, sin requerir que los módulos posteriores estén implementados.

### Requirement 17: Recuperación de contraseña por correo electrónico

**User Story:** Como Usuario, quiero restablecer mi contraseña mediante un enlace enviado a mi correo, para recuperar el acceso sin intervención de otra persona.

#### Acceptance Criteria

1. WHEN un visitante envía un Correo_Electrónico en la solicitud de recuperación, THE Backend SHALL responder con código 200 y el mismo mensaje en español, exista o no una cuenta activa con ese correo.
2. WHEN el Correo_Electrónico enviado corresponde a una cuenta activa, THE Backend SHALL generar un Token_de_Recuperación aleatorio de al menos 32 bytes, almacenar únicamente su hash SHA-256, invalidar los Tokens_de_Recuperación previos de esa cuenta y asignarle una vigencia de 30 minutos.
3. WHERE hay un servidor SMTP configurado mediante variables de entorno, THE Backend SHALL enviar por correo al Correo_Electrónico de la cuenta un enlace de restablecimiento que contiene el Token_de_Recuperación.
4. WHERE no hay un servidor SMTP configurado y el entorno no es de producción, THE Backend SHALL escribir el mensaje con el enlace de restablecimiento en la Bandeja_Local.
5. WHEN un visitante envía un Token_de_Recuperación vigente y no usado junto con una nueva contraseña de 8 a 128 caracteres, THE Backend SHALL actualizar el hash de la contraseña, marcar el token como usado, indicar que la cuenta no requiere cambio de contraseña e invalidar todas las Sesiones activas de la cuenta.
6. IF el Token_de_Recuperación enviado no existe, está vencido o ya fue usado, THEN THE Backend SHALL responder con código 400 y un mensaje en español que indique que el enlace es inválido o venció, sin modificar la contraseña.
7. IF la nueva contraseña enviada está fuera del rango de 8 a 128 caracteres, THEN THE Backend SHALL responder con código 400 indicando el campo inválido, conservar el hash de la contraseña y mantener vigente el Token_de_Recuperación.
8. IF una misma dirección envía 5 solicitudes de recuperación en 15 minutos, THEN THE Backend SHALL rechazar nuevas solicitudes con código 429 durante 15 minutos.
9. WHEN se solicita o se completa una recuperación de contraseña para una cuenta existente, THE Backend SHALL registrar la acción en la Bitácora_de_Auditoría sin incluir el Token_de_Recuperación.
10. THE Frontend SHALL mostrar en la página de inicio de sesión un enlace para recuperar la contraseña, y páginas en español para solicitar el enlace y para establecer la nueva contraseña.
11. THE Backend SHALL leer los datos de conexión SMTP (servidor, puerto, usuario, contraseña y remitente) exclusivamente desde variables de entorno opcionales.

### Requirement 18: Autorización administrativa para documentos de empleados

**User Story:** Como Director, quiero acceder a los documentos de los empleados mediante una autorización temporal con mi propia contraseña, para proteger información sensible sin usar una contraseña maestra compartida.

#### Acceptance Criteria

1. WHEN un Administrador autenticado envía su propia contraseña actual a la solicitud de Autorización_Administrativa y la contraseña es correcta, THE Backend SHALL otorgar una Autorización_Administrativa con vigencia de 10 minutos, asociada a su Sesión y a su cuenta, y responder con la fecha y hora de vencimiento.
2. THE Backend SHALL almacenar únicamente el hash de la Autorización_Administrativa y SHALL excluirla de los registros de consola y de la Bitácora_de_Auditoría.
3. IF la contraseña enviada para la Autorización_Administrativa es incorrecta, THEN THE Backend SHALL responder con código 401, no otorgar la autorización y registrar el rechazo en la Bitácora_de_Auditoría.
4. IF un Administrador envía 5 contraseñas incorrectas consecutivas a la solicitud de Autorización_Administrativa en 15 minutos, THEN THE Backend SHALL rechazar nuevas solicitudes con código 429 durante 15 minutos, incluso con la contraseña correcta.
5. IF un Administrador solicita un Documento_de_Empleado sin Autorización_Administrativa vigente, THEN THE Backend SHALL responder con código 403 y el código de error "AUTORIZACION_ADMIN_REQUERIDA", sin incluir datos del documento.
6. IF un Usuario con Rol distinto de Administrador solicita una Autorización_Administrativa, THEN THE Backend SHALL responder con código 403 sin otorgar la autorización.
7. WHEN la Sesión del Administrador se cierra o expira, o el Administrador cambia su contraseña, o el Administrador solicita revocarla, THE Backend SHALL invalidar la Autorización_Administrativa de esa Sesión.
8. WHEN una Autorización_Administrativa vence, THE Backend SHALL rechazar las solicitudes de documentos con el código de error del criterio 5 sin cerrar la Sesión.
9. WHEN el Backend responde con el código de error "AUTORIZACION_ADMIN_REQUERIDA", THE Frontend SHALL mostrar un diálogo en español que solicita la contraseña del Administrador y, tras una autorización exitosa, repetir la solicitud original.
10. THE Sistema SHALL autenticar el acceso administrativo a documentos únicamente con la contraseña propia de la cuenta del Administrador, sin contraseña maestra, sin credencial compartida y sin credenciales en texto plano.

### Requirement 19: Documentos de empleados y apartado privado

**User Story:** Como Empleado, quiero consultar mis documentos oficiales en un apartado privado, y como Director, quiero gestionar los documentos de contratación y acreditación del personal.

#### Acceptance Criteria

1. THE Sistema SHALL almacenar para cada Documento_de_Empleado: Empleado propietario, tipo ("contratación" o "acreditación"), título (1 a 150 caracteres), fecha de emisión no posterior a la fecha actual, fecha de vencimiento opcional no anterior a la fecha de emisión y un archivo PDF ficticio de hasta 5 MB.
2. WHILE el Administrador tiene una Autorización_Administrativa vigente, THE Backend SHALL permitirle listar, consultar, descargar, cargar, reemplazar y eliminar los Documentos_de_Empleado de cualquier Empleado.
3. IF un archivo cargado no es un PDF (según su firma de archivo), excede 5 MB o incumple las reglas de fechas del criterio 1, THEN THE Backend SHALL responder con código 400 indicando el campo inválido y conservar los datos existentes.
4. WHEN un Empleado abre su Apartado_Privado, THE Backend SHALL devolver la lista de sus propios Documentos_de_Empleado y permitir su consulta y descarga, sin permitir cargarlos, modificarlos ni eliminarlos.
5. IF un Empleado solicita un Documento_de_Empleado de otro Empleado, THEN THE Backend SHALL responder con código 403 sin incluir datos del documento.
6. THE Backend SHALL entregar los archivos de Documentos_de_Empleado únicamente mediante solicitudes autenticadas y autorizadas, con tipo de contenido application/pdf, sin exponerlos como archivos estáticos públicos.
7. WHEN se consulta, descarga, carga, reemplaza o elimina un Documento_de_Empleado, THE Backend SHALL registrar en la Bitácora_de_Auditoría el usuario, la acción, el Empleado propietario y el identificador del documento.
8. WHEN un Administrador elimina un Empleado, THE Backend SHALL eliminar también sus Documentos_de_Empleado y los archivos asociados.
9. THE Frontend SHALL mostrar el Apartado_Privado como una entrada de menú propia en el Perfil de cada Empleado, con la lista de documentos, su tipo, sus fechas y un indicador visible de "vencido" cuando la fecha de vencimiento es anterior a la fecha actual.

### Requirement 20: Historial de movimientos y tratamientos de pacientes

**User Story:** Como Administrador, quiero un historial de ingresos, altas y fallecimientos y de tratamientos de cada Paciente, para distinguir su situación y reconstruir su estancia.

#### Acceptance Criteria

1. WHEN un Administrador crea un Paciente, THE Backend SHALL agregar al Historial_del_Paciente un Registro_de_Movimiento_del_Paciente de tipo "ingreso" con la fecha de ingreso, el Departamento y el usuario, dentro de la misma transacción.
2. WHEN el Estado_del_Paciente cambia a "dado de alta" o "fallecido", THE Backend SHALL agregar al Historial_del_Paciente un Registro_de_Movimiento_del_Paciente de tipo "alta" o "fallecimiento" respectivamente, con fecha y hora, y para "fallecimiento" SHALL almacenar esa fecha y hora como fecha de fallecimiento.
3. IF la fecha y hora de fallecimiento es posterior a la fecha actual o anterior al último ingreso del Paciente, THEN THE Backend SHALL responder con código 400 y conservar el estado del Paciente.
4. WHEN un Administrador registra un reingreso de un Paciente con estado "dado de alta", con fecha de ingreso válida, Departamento y motivo, THE Backend SHALL establecer el estado en "activo", actualizar la fecha de ingreso más reciente y agregar un Registro_de_Movimiento_del_Paciente de tipo "ingreso".
5. IF un Administrador intenta cambiar el estado de un Paciente "fallecido" a otro estado o registrar su reingreso, THEN THE Backend SHALL responder con código 409 y conservar el Paciente sin cambios.
6. WHEN un Administrador, o el Médico o Enfermero responsable, solicita el Historial_del_Paciente, THE Backend SHALL devolver los registros ordenados por fecha y hora de más reciente a más antiguo.
7. IF un Médico o Enfermero solicita el Historial_del_Paciente de un Paciente para el cual no figura como responsable, THEN THE Backend SHALL responder con código 403 sin incluir datos del historial.
8. THE Backend SHALL rechazar con código 405 cualquier solicitud de edición o eliminación de Registros_de_Movimiento_del_Paciente.
9. WHEN el Frontend muestra el Módulo_Pacientes, THE Frontend SHALL ofrecer tres pestañas ("Activos", "Dados de alta" y "Fallecidos"), cada una con el número de Pacientes de ese estado, y SHALL mostrar el estado de cada Paciente con el indicador de color del Requisito 15.
10. WHEN un usuario autorizado abre el detalle de un Paciente, THE Frontend SHALL mostrar el Historial_del_Paciente y la lista de Tratamientos_Programados con su tipo ("tratamiento" o "cirugía") y su estado, ordenados por fecha de más reciente a más antigua, con filtro opcional por tipo y por estado.
11. IF un Tratamiento_Programado tiene un tipo distinto de "tratamiento" o "cirugía", o un estado distinto de "programado", "realizado" o "cancelado", THEN THE Backend SHALL responder con código 400 y conservar los datos existentes.

### Requirement 21: Permisos de actualización de Médicos y Enfermeros

**User Story:** Como Médico o Enfermero, quiero actualizar solo la información de mis Pacientes que me corresponde, para mantener el registro al día sin alterar datos ajenos a mi función.

#### Acceptance Criteria

1. WHILE el Estado_del_Paciente es "activo", WHEN el Médico responsable envía una actualización de la Observación_Médica de su Paciente, THE Backend SHALL guardar el texto (0 a 1000 caracteres) junto con el usuario y la fecha y hora de actualización.
2. WHILE el Estado_del_Paciente es "activo", WHEN el Enfermero responsable envía una actualización de la Observación_de_Enfermería de su Paciente, THE Backend SHALL guardar el texto (0 a 1000 caracteres) junto con el usuario y la fecha y hora de actualización.
3. WHILE el Estado_del_Paciente es "activo", WHEN el Médico responsable registra, edita o cancela un Tratamiento_Programado de su Paciente con datos válidos, THE Backend SHALL guardar el cambio en la Base_de_Datos.
4. WHILE el Estado_del_Paciente es "activo", WHEN el Médico o el Enfermero responsable marca como "realizado" un Tratamiento_Programado con estado "programado" de su Paciente, THE Backend SHALL guardar el cambio de estado y la fecha y hora de realización.
5. IF un Médico o Enfermero intenta modificar un campo que no le corresponde (datos generales, Departamento, médico o enfermero responsable, Estado_del_Paciente, fecha de ingreso, la observación del otro Rol, o cualquier Tratamiento_Programado distinto de los permitidos en los criterios 3 y 4), THEN THE Backend SHALL responder con código 403 y dejar el Paciente sin cambios.
6. IF un Médico o Enfermero intenta actualizar información de un Paciente para el cual no figura como responsable, THEN THE Backend SHALL responder con código 403 sin modificar ni revelar datos del Paciente.
7. IF un Médico o Enfermero intenta actualizar información de un Paciente con Estado_del_Paciente "dado de alta" o "fallecido", THEN THE Backend SHALL responder con código 409 y dejar el Paciente sin cambios.
8. THE Frontend SHALL mostrar en el detalle del Paciente únicamente los controles de edición que el Rol del Usuario puede ejecutar según los criterios 1 a 4.

### Requirement 22: Clasificación de medicamentos e insumos médicos

**User Story:** Como Administrador, quiero clasificar con detalle los medicamentos y los insumos médicos, para identificar rápidamente su tipo y sus requisitos de receta.

#### Acceptance Criteria

1. WHEN un Administrador crea o edita un Producto de categoría insumo médico, THE Backend SHALL aceptar como clasificación únicamente una Subcategoría_de_Insumo: jeringa, sonda, catéter, suero, instrumental o material médico.
2. WHEN un Administrador crea o edita un Producto de categoría medicamento, THE Backend SHALL exigir: tipo ("genérico" o "de patente"), principio activo (1 a 100 caracteres), clasificación de control, indicador de receta requerida y, cuando el tipo es "de patente", nombre comercial (1 a 100 caracteres).
3. THE Backend SHALL aceptar como clasificación de control únicamente los valores "venta libre", "receta simple", "receta retenida", "controlado" y "uso hospitalario".
4. IF la clasificación de control es "receta simple", "receta retenida" o "controlado" y la receta requerida es falsa, o la clasificación es "venta libre" y la receta requerida es verdadera, THEN THE Backend SHALL responder con código 400 indicando el campo inconsistente y conservar los datos existentes.
5. IF un Producto de categoría insumo médico incluye datos de medicamento, o un Producto de categoría distinta de medicamento incluye datos de medicamento, THEN THE Backend SHALL responder con código 400 y conservar los datos existentes.
6. WHEN un Administrador solicita la lista de Productos, THE Backend SHALL ofrecer, además de los filtros del Requisito 7, filtros opcionales por tipo de medicamento, clasificación de control, receta requerida y condición de Medicamento_Controlado, combinados con AND.
7. THE Frontend SHALL mostrar una insignia "Controlado" en cada Medicamento_Controlado y un aviso en español de que los datos de medicamentos son ficticios y de demostración.

### Requirement 23: Inventario de limpieza independiente

**User Story:** Como Administrador, quiero un inventario de limpieza separado del inventario médico, para gestionar y consultar cada uno con sus propios responsables.

#### Acceptance Criteria

1. THE Sistema SHALL ofrecer el Módulo_Inventario_Limpieza como un módulo independiente del Módulo_Inventario, con entrada de menú, pantalla y recursos de API propios.
2. THE Backend SHALL devolver en el Módulo_Inventario únicamente Productos de categoría insumo médico y medicamento, y en el Módulo_Inventario_Limpieza únicamente Productos de categoría material de limpieza.
3. IF un Administrador intenta crear o editar en el Módulo_Inventario un Producto de categoría material de limpieza, o en el Módulo_Inventario_Limpieza un Producto de otra categoría, THEN THE Backend SHALL responder con código 400 indicando la categoría inválida y conservar los datos existentes.
4. WHEN un Administrador crea, edita, elimina o ajusta la cantidad de un Producto en el Módulo_Inventario_Limpieza con datos válidos, THE Backend SHALL guardar el cambio, aplicar las reglas de Stock_Bajo y disponibilidad del Requisito 7 y registrar el Movimiento_de_Inventario del Requisito 25.
5. WHERE el Usuario tiene el Rol Personal_de_Limpieza, THE Backend SHALL permitir únicamente la consulta del Módulo_Inventario_Limpieza y SHALL responder con código 403 a cualquier solicitud de modificación o a cualquier solicitud al Módulo_Inventario.
6. WHEN el Módulo_Dashboard cuenta los Productos con Stock_Bajo, THE Backend SHALL incluir los Productos de ambos inventarios.

### Requirement 24: Entregas de proveedores

**User Story:** Como Administrador, quiero registrar las entregas de los proveedores con sus cantidades, para controlar qué se espera y qué se recibió.

#### Acceptance Criteria

1. WHEN un Administrador crea o edita una Entrega_de_Proveedor con estado "programada", Proveedor, Producto, cantidad solicitada (entero de 1 a 999,999) y fecha programada válidos, THE Backend SHALL guardar la entrega.
2. IF el Proveedor de la Entrega_de_Proveedor no es el Proveedor registrado del Producto, o el Producto o el Proveedor no existe, THEN THE Backend SHALL responder con código 400 y no guardar la entrega.
3. WHEN un Administrador registra la recepción de una Entrega_de_Proveedor con estado "programada", indicando una fecha de recepción no posterior a la fecha actual y una cantidad recibida (entero de 1 a 999,999), THE Backend SHALL, en una sola transacción, cambiar el estado a "recibida", registrar un Movimiento_de_Inventario de tipo "entrada" por la cantidad recibida, incrementar la cantidad del Producto y registrar la operación en la Bitácora_de_Auditoría.
4. IF la cantidad resultante del Producto excede 999,999, THEN THE Backend SHALL responder con código 409 y conservar sin cambios la entrega y el Producto.
5. IF un Administrador intenta recibir, editar o cancelar una Entrega_de_Proveedor cuyo estado no es "programada", THEN THE Backend SHALL responder con código 409 y conservar la entrega sin cambios.
6. WHEN un Administrador cancela una Entrega_de_Proveedor con estado "programada", THE Backend SHALL cambiar su estado a "cancelada", sin modificar la cantidad del Producto, y registrar la operación en la Bitácora_de_Auditoría.
7. WHEN un Administrador solicita la lista de Entregas_de_Proveedor, THE Backend SHALL devolver las entregas que cumplan todos los filtros opcionales indicados (Proveedor, Producto, estado y rango de fechas programadas inclusivo), ordenadas por fecha programada descendente y paginadas según el Requisito 13.
8. WHEN un Administrador abre el detalle de un Proveedor, THE Frontend SHALL mostrar sus Productos y su historial de Entregas_de_Proveedor con las cantidades solicitadas y recibidas.
9. IF un Usuario con Rol distinto de Administrador solicita el recurso de Entregas_de_Proveedor, THEN THE Backend SHALL responder con código 403 sin incluir datos de entregas.

### Requirement 25: Historial de movimientos de inventario

**User Story:** Como Administrador, quiero un historial de movimientos de inventario, para saber cuándo, por qué y quién cambió la cantidad de cada Producto.

#### Acceptance Criteria

1. WHEN la cantidad de un Producto cambia por la creación del Producto con cantidad mayor que cero, una recepción de entrega, una salida, un ajuste o una edición del Producto que modifica la cantidad, THE Backend SHALL registrar un Movimiento_de_Inventario con el Producto, el tipo ("entrada", "salida" o "ajuste"), la cantidad anterior, la cantidad resultante, el motivo (1 a 200 caracteres), el usuario, la fecha y hora en formato UTC y, cuando corresponde, la Entrega_de_Proveedor asociada, dentro de la misma transacción que el cambio.
2. WHEN un Administrador registra una salida de un Producto con una cantidad entera de 1 o más y no mayor que la cantidad existente, THE Backend SHALL disminuir la cantidad del Producto y registrar el Movimiento_de_Inventario de tipo "salida".
3. IF un Administrador registra una salida con una cantidad mayor que la cantidad existente del Producto, THEN THE Backend SHALL responder con código 409 y conservar sin cambios la cantidad del Producto.
4. IF un Administrador registra un movimiento sin motivo o con un motivo de más de 200 caracteres, THEN THE Backend SHALL responder con código 400 y conservar sin cambios la cantidad del Producto.
5. WHEN un Administrador solicita el historial de Movimientos_de_Inventario, THE Backend SHALL devolver los movimientos que cumplan todos los filtros opcionales indicados (Producto, categoría, tipo, usuario y rango de fechas inclusivo), ordenados por fecha y hora descendente y paginados según el Requisito 13.
6. THE Backend SHALL rechazar con código 405 cualquier solicitud de edición o eliminación de Movimientos_de_Inventario.
7. IF el registro del Movimiento_de_Inventario falla, THEN THE Backend SHALL revertir el cambio de cantidad asociado y responder con código 500.
8. WHEN un Administrador abre el detalle de un Producto, THE Frontend SHALL mostrar los Movimientos_de_Inventario de ese Producto.
9. IF un Usuario con Rol distinto de Administrador solicita Movimientos_de_Inventario, THEN THE Backend SHALL responder con código 403 sin incluir datos de movimientos.

### Requirement 26: Mantenimiento y resumen de equipos médicos

**User Story:** Como Administrador, quiero registrar reparaciones y mantenimientos y ver cuántos equipos hay por categoría y departamento, para planificar el equipamiento.

#### Acceptance Criteria

1. WHEN un Administrador registra un Registro_de_Mantenimiento con Equipo_Médico existente, tipo ("preventivo", "correctivo" o "reparación"), fecha de inicio no posterior a la fecha actual, descripción (1 a 500 caracteres) y técnico (1 a 100 caracteres), THE Backend SHALL guardar el registro y establecer el Estado_Operativo del Equipo_Médico en "en mantenimiento".
2. WHEN un Administrador cierra un Registro_de_Mantenimiento en curso indicando una fecha de fin no anterior a la fecha de inicio y el Estado_Operativo resultante ("disponible" o "fuera de servicio"), THE Backend SHALL guardar la fecha de fin y establecer ese Estado_Operativo en el Equipo_Médico.
3. IF un Administrador registra un Registro_de_Mantenimiento para un Equipo_Médico que ya tiene un registro en curso, THEN THE Backend SHALL responder con código 409 y conservar los datos existentes.
4. IF un Registro_de_Mantenimiento incumple las reglas de los criterios 1 y 2, THEN THE Backend SHALL responder con código 400 indicando el campo inválido, o con código 404 si el Equipo_Médico no existe, y conservar los datos existentes.
5. WHEN se registra o se cierra un Registro_de_Mantenimiento, THE Backend SHALL registrar en la Bitácora_de_Auditoría el usuario, el Equipo_Médico, la operación y el Estado_Operativo anterior y el nuevo.
6. WHEN un Administrador solicita los Registros_de_Mantenimiento, THE Backend SHALL devolver los registros que cumplan todos los filtros opcionales indicados (Equipo_Médico, Departamento, tipo, en curso o cerrado, y rango de fechas de inicio inclusivo), ordenados por fecha de inicio descendente y paginados según el Requisito 13.
7. WHEN un Administrador solicita el resumen de equipamiento, THE Backend SHALL calcular, a partir de los datos vigentes en cada solicitud, la suma de las cantidades de Equipos_Médicos por cada combinación de categoría y Departamento, los totales por categoría, los totales por Departamento y el total general.
8. WHEN un Administrador abre el detalle de un Equipo_Médico, THE Frontend SHALL mostrar su historial de Registros_de_Mantenimiento.
9. IF un Usuario con Rol distinto de Administrador solicita Registros_de_Mantenimiento o el resumen de equipamiento, THEN THE Backend SHALL responder con código 403 sin incluir datos.

### Requirement 27: Contadores e historial de ocupación de habitaciones

**User Story:** Como Administrador, quiero ver cuántas habitaciones están ocupadas y disponibles y consultar el historial de ocupación por Departamento, para gestionar la capacidad del hospital.

#### Acceptance Criteria

1. WHEN un Administrador abre el Módulo_Habitaciones, THE Backend SHALL calcular, a partir de las Asignaciones activas vigentes en cada solicitud, el número de Habitaciones ocupadas y disponibles en total y por Departamento.
2. WHEN un Administrador registra una asignación o una liberación con éxito, THE Frontend SHALL mostrar los contadores actualizados en un máximo de 2 segundos, sin recargar la página.
3. THE Backend SHALL almacenar el Motivo_de_Liberación ("alta" o "fallecimiento") en cada Asignación cerrada, y SHALL dejarlo ausente mientras la Asignación esté activa.
4. WHEN un Administrador solicita el Historial_de_Ocupación, THE Backend SHALL devolver las Asignaciones, activas y cerradas, que cumplan todos los filtros opcionales indicados (Departamento, Habitación, Motivo_de_Liberación y rango de fechas de inicio inclusivo), con número de Habitación, Departamento, Paciente, fecha de inicio, fecha de fin y Motivo_de_Liberación, ordenadas por fecha de inicio descendente y paginadas según el Requisito 13.
5. WHEN un Administrador solicita el resumen del Historial_de_Ocupación por Departamento, THE Backend SHALL calcular para cada Departamento el número de Asignaciones iniciadas en el rango de fechas indicado, el número de Asignaciones activas, el número de liberaciones por "alta" y el número de liberaciones por "fallecimiento".
6. IF un Usuario con Rol distinto de Administrador solicita contadores, Historial_de_Ocupación o su resumen, THEN THE Backend SHALL responder con código 403 sin incluir datos.
7. THE Frontend SHALL mostrar el Historial_de_Ocupación y su resumen en una pestaña "Historial" del Módulo_Habitaciones, con filtro por Departamento.

### Requirement 28: Calendario de turnos, días inhábiles y entregas de proveedores

**User Story:** Como Usuario, quiero ver en los calendarios los turnos, los días inhábiles y las entregas de proveedores, para planificar el trabajo del hospital.

#### Acceptance Criteria

1. WHEN un Administrador consulta el Calendario_de_Turnos para un rango de fechas, THE Backend SHALL generar para cada día del rango, y para cada Turno ("matutino" y "vespertino"), la lista de Empleados activos de ese Turno con su hora de entrada y de salida según el Horario_de_Trabajo del día de la semana correspondiente.
2. WHEN un Empleado consulta el Calendario_de_Turnos, THE Backend SHALL devolver únicamente su propio Turno y su propio horario.
3. WHEN un Administrador crea, edita o elimina un Día_Inhábil con título (1 a 150 caracteres), fecha y descripción (0 a 500 caracteres) válidos, THE Backend SHALL guardar el cambio en la Base_de_Datos.
4. IF un Administrador crea o edita un Día_Inhábil con una fecha ya registrada para otro Día_Inhábil, THEN THE Backend SHALL responder con código 409 y conservar los datos existentes.
5. WHEN un Usuario consulta el calendario general, THE Backend SHALL incluir los Eventos de tipo general, los Días_Inhábiles, los feriados disponibles según el Requisito 11 y las Entregas_de_Proveedor con estado "programada" o "recibida", cada una como Evento de tipo correspondiente.
6. WHEN un Usuario consulta el calendario de actividades y entregas, THE Backend SHALL incluir los Eventos de tipo actividad y entrega y las Entregas_de_Proveedor con estado "programada" o "recibida" cuya fecha programada se solape con el rango consultado.
7. THE Backend SHALL excluir de los calendarios las Entregas_de_Proveedor con estado "cancelada".
8. WHEN el Frontend muestra una Entrega_de_Proveedor en un calendario, THE Frontend SHALL mostrar el Proveedor, el Producto y la cantidad solicitada, y SHALL asignarle el color del Tipo_de_Evento entrega.
9. IF un Usuario con Rol distinto de Administrador intenta crear, editar o eliminar un Día_Inhábil, THEN THE Backend SHALL responder con código 403 y conservar los datos existentes.
