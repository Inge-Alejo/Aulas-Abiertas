import assert from 'node:assert';
import authHandler, { verifyToken } from '../api/auth.js';
import scheduleHandler from '../api/schedule.js';

console.log('🧪 Ejecutando suite de pruebas unitarias para Auth de Vercel y Sincronización...\n');

// Mock helpers para req/res de Vercel Serverless Function
function createMockReqRes(options = {}) {
  const req = {
    method: options.method || 'GET',
    headers: options.headers || {},
    body: options.body || {},
    query: options.query || {}
  };

  let statusCode = 200;
  let responseData = null;
  const headers = {};

  const res = {
    status(code) {
      statusCode = code;
      return res;
    },
    setHeader(key, val) {
      headers[key] = val;
    },
    json(data) {
      responseData = data;
      return res;
    },
    end() {
      return res;
    },
    _getStatusCode: () => statusCode,
    _getData: () => responseData
  };

  return { req, res };
}

async function runTests() {
  const TEST_PASSWORD = 'ClaveDePruebaSegura2026*';
  process.env.ADMIN_PASSWORD = TEST_PASSWORD;
  process.env.ADMIN_EMAIL = 'aprendizajes.med@udea.edu.co';

  // 1. Login con credenciales válidas
  console.log('1. Autenticación con Vercel Serverless API (/api/auth):');
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {
        action: 'login',
        email: 'aprendizajes.med@udea.edu.co',
        password: TEST_PASSWORD
      }
    });

    await authHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 200);
    const data = res._getData();
    assert.strictEqual(data.success, true);
    assert.ok(data.token, 'Debe retornar un token de sesión');
    assert.strictEqual(data.user.email, 'aprendizajes.med@udea.edu.co');
    assert.strictEqual(data.authProvider, 'vercel');
    console.log('  ✓ Inicio de sesión exitoso por Vercel con token firmado.');

    // 2. Verificar el token emitido
    const payload = verifyToken(data.token);
    assert.ok(payload);
    assert.strictEqual(payload.email, 'aprendizajes.med@udea.edu.co');
    assert.strictEqual(payload.role, 'admin');
    console.log('  ✓ Verificación criptográfica HMAC-SHA256 del token exitosa.');

    // 3. Endpoint de verificación con Bearer
    const { req: reqVerify, res: resVerify } = createMockReqRes({
      method: 'GET',
      headers: {
        authorization: `Bearer ${data.token}`
      },
      query: { action: 'verify' }
    });

    await authHandler(reqVerify, resVerify);
    assert.strictEqual(resVerify._getStatusCode(), 200);
    assert.strictEqual(resVerify._getData().valid, true);
    console.log('  ✓ Verificación de sesión activa mediante Authorization: Bearer <token>.');

    // 4. Intentar guardar agenda en /api/schedule con token autorizado
    console.log('\n2. Persistencia en la nube de Programación (/api/schedule):');
    const sampleActivities = [
      {
        id: 'AA-2026-11-02-0700-0',
        date: '2026-11-02',
        startTime: '07:00',
        endTime: '08:00',
        department: 'Cardiología',
        title: 'Avances en Falla Cardíaca 2026',
        speakers: 'Dr. Alejandro Restrepo',
        modality: 'Virtual',
        location: 'Zoom Institucional',
        meeting_url: 'https://zoom.us/j/123456789',
        recording_url: '',
        summary: 'Mesa redonda sobre guías terapéuticas.',
        weekKey: '2026-11-02',
        weekMonday: '2026-11-02',
        weekSunday: '2026-11-08',
        dayLabel: 'Lunes 2 de Noviembre'
      }
    ];

    const { req: reqSave, res: resSave } = createMockReqRes({
      method: 'POST',
      headers: {
        authorization: `Bearer ${data.token}`
      },
      body: {
        activities: sampleActivities,
        source: 'Prueba Automatizada',
        updatedBy: 'aprendizajes.med@udea.edu.co'
      }
    });

    await scheduleHandler(reqSave, resSave);
    assert.strictEqual(resSave._getStatusCode(), 200);
    assert.strictEqual(resSave._getData().success, true);
    console.log('  ✓ Publicación y persistencia de actividades exitosa en la nube.');

    // 5. Consulta GET pública de la agenda desde cualquier dispositivo
    const { req: reqGet, res: resGet } = createMockReqRes({
      method: 'GET'
    });

    await scheduleHandler(reqGet, resGet);
    assert.strictEqual(resGet._getStatusCode(), 200);
    const getData = resGet._getData();
    assert.strictEqual(getData.success, true);
    assert.strictEqual(getData.count, 1);
    assert.strictEqual(getData.activities[0].title, 'Avances en Falla Cardíaca 2026');
    console.log('  ✓ Consulta pública de la agenda activa desde cualquier dispositivo validada.');
  }

  // 6. Rechazo de credenciales incorrectas
  console.log('\n3. Seguridad y Control de Acceso:');
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {
        action: 'login',
        email: 'intruso@externo.com',
        password: 'PasswordIncorrecto'
      }
    });

    await authHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 401);
    console.log('  ✓ Rechazo seguro ante credenciales no autorizadas (HTTP 401).');
  }

  // 7. Rechazo de escritura en schedule sin token
  {
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {
        activities: [{ title: 'Actividad no autorizada' }]
      }
    });

    await scheduleHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 401);
    console.log('  ✓ Rechazo seguro de publicación de agenda sin token de Vercel (HTTP 401).');
  }

  // 8. Rechazo si ADMIN_PASSWORD no está configurada en el entorno
  {
    delete process.env.ADMIN_PASSWORD;
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {
        action: 'login',
        email: 'aprendizajes.med@udea.edu.co',
        password: 'CualquierPassword'
      }
    });

    await authHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 500);
    assert.ok(res._getData().error.includes('ADMIN_PASSWORD'));
    console.log('  ✓ Protección activa: No permite inicio de sesión si ADMIN_PASSWORD no está definida (HTTP 500).');
  }

  // 9. Permitir cualquier correo válido si ADMIN_EMAIL no está configurada
  {
    process.env.ADMIN_PASSWORD = TEST_PASSWORD;
    delete process.env.ADMIN_EMAIL; // Sin restricción de correo
    const { req, res } = createMockReqRes({
      method: 'POST',
      body: {
        action: 'login',
        email: 'medico.docente@gmail.com',
        password: TEST_PASSWORD
      }
    });

    await authHandler(req, res);
    assert.strictEqual(res._getStatusCode(), 200);
    assert.strictEqual(res._getData().success, true);
    assert.strictEqual(res._getData().user.email, 'medico.docente@gmail.com');
    console.log('  ✓ Flexibilidad de acceso: Permite cualquier correo si ADMIN_EMAIL no está fijado.');
  }

  console.log('\n🎉 ¡TODAS LAS PRUEBAS DE VERCEL AUTH Y SYNC PASARON EXITOSAMENTE (100% OK)!');
}

runTests().catch(err => {
  console.error('❌ Error en pruebas:', err);
  process.exit(1);
});

