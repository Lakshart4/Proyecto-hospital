import { Link, useNavigate } from 'react-router-dom';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { Spinner } from '../../../shared/components/Spinner';
import { useApi } from '../../../shared/hooks/useApi';
import { useAuth } from '../../../shared/hooks/useAuth';
import { createPatient, listPatientDepartments, listResponsibleStaff } from '../api';
import { PatientForm } from '../components/PatientForm';
import { patientFullName } from '../utils';

export function PatientCreatePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const departmentsQuery = useApi((signal) => listPatientDepartments(signal), [], { enabled: isAdmin });
  const doctorsQuery = useApi((signal) => listResponsibleStaff('DOCTOR', signal), [], { enabled: isAdmin });
  const nursesQuery = useApi((signal) => listResponsibleStaff('NURSE', signal), [], { enabled: isAdmin });
  const loading = departmentsQuery.loading || doctorsQuery.loading || nursesQuery.loading;
  const error = departmentsQuery.error ?? doctorsQuery.error ?? nursesQuery.error;

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-heading">Registrar paciente</h1>
        <ErrorBanner message="Solo un Administrador puede registrar pacientes." />
        <Link to="/pacientes" className="text-sm font-medium text-primary hover:underline">Volver al listado</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-heading">Registrar paciente</h1>
          <p className="text-sm text-muted">Captura los datos generales y las personas responsables.</p>
        </div>
        <Link to="/pacientes" className="text-sm font-medium text-primary hover:underline">Volver al listado</Link>
      </div>
      {error && <ErrorBanner message={error.message} />}
      {loading ? (
        <div className="flex items-center gap-2 py-8"><Spinner /><span className="text-sm text-muted">Cargando formulario…</span></div>
      ) : (
        <div className="rounded-lg border border-border bg-page p-4 sm:p-6">
          <PatientForm
            departments={departmentsQuery.data ?? []}
            doctors={doctorsQuery.data ?? []}
            nurses={nursesQuery.data ?? []}
            submitLabel="Crear paciente"
            onCancel={() => navigate('/pacientes')}
            onSubmit={async (payload) => {
              const patient = await createPatient(payload);
              navigate(`/pacientes/${patient.id}`, { state: { message: `Paciente ${patientFullName(patient)} registrado correctamente.` } });
            }}
          />
        </div>
      )}
    </div>
  );
}
