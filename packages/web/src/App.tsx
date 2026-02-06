import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { CheckSquare } from 'lucide-react';

function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <CheckSquare className="w-16 h-16 text-indigo-600" />
          </div>
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            Welcome to Taskflow
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Self-hosted task management for teams and individuals
          </p>
          <div className="flex gap-4 justify-center">
            <button className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors">
              Get Started
            </button>
            <button className="bg-white text-indigo-600 px-6 py-3 rounded-lg font-semibold border-2 border-indigo-600 hover:bg-indigo-50 transition-colors">
              Learn More
            </button>
          </div>
        </div>

        <div className="mt-16 grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-2 text-gray-900">Self-Hosted</h3>
            <p className="text-gray-600">
              Keep your data private and secure on your own infrastructure
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-2 text-gray-900">Open Source</h3>
            <p className="text-gray-600">
              Built with modern technologies and fully customizable
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-semibold mb-2 text-gray-900">Feature Rich</h3>
            <p className="text-gray-600">
              Projects, tasks, priorities, and real-time collaboration
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
