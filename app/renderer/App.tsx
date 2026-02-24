import { MainLayout } from './MainLayout';
import { useAppBootstrap } from './application/usecases/useAppBootstrap';

export function App() {
  const apiReady = useAppBootstrap();

  if (!apiReady) {
    return (
      <div className="bootstrap-fallback">
        <h2>Initializing...</h2>
        <p>Preparing renderer API. The app will retry automatically.</p>
      </div>
    );
  }

  return <MainLayout />;
}
