import { useState, useContext } from "react";
import api from "../api/axiosInstance";
import { AuthContext } from "../context/AuthContext.jsx";
import { useNavigate, Link } from "react-router-dom";
import businessSettings from "../config/businessSettings";

const LoginPage = () => {
    const { setToken, setUser } = useContext(AuthContext);
    const [form, setForm] = useState({ username: "", password: "" });
    const [showPassword, setShowPassword] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async () => {
        try {
            const res = await api.post("/auth/login", form);
            setToken(res.data.token);
            setUser(res.data.user);
            localStorage.setItem("token", res.data.token);
            localStorage.setItem("user", JSON.stringify(res.data.user));

            res.data.user.role === "admin"
                ? navigate("/admin")
                : navigate("/pos");
        } catch (err) {
            alert("Login failed");
            console.error(err);
        }
    };

    return (
        <div
            className="fixed inset-0 w-screen h-dvh bg-cover bg-center"
            style={{
                backgroundImage: "url('/Login/login.jpg')",
            }}
        >
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/55" />

            {/* Center Wrapper */}
            <div className="relative z-10 flex items-center justify-center w-full h-full px-4">

                {/* Card */}
                <div className="w-full rounded-2xl max-w-md
                    bg-white text-gray-900 shadow-2xl
                    p-6 sm:p-8 md:p-10
                    animate-fadeIn">

                    {/* Title */}
                    <div className="text-center mb-6">
                        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 mx-auto">
                            {businessSettings.name}
                        </h1>
                        <p className="text-gray-500 text-sm mt-1">
                            Welcome back
                        </p>
                    </div>

                    <div className="space-y-5">

                        {/* Username */}
                        <div className="flex flex-col gap-2">
                            <label htmlFor="login-username" className="text-gray-700 text-sm font-medium">
                                Username
                            </label>
                            <input
                                id="login-username"
                                name="username"
                                autoComplete="username"
                                className="w-full h-12 bg-white text-gray-900 placeholder-gray-400
                                border border-gray-300 rounded-md px-4
                                outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-indigo-300 transition-colors"
                                value={form.username}
                                onChange={(e) =>
                                    setForm({ ...form, username: e.target.value })
                                }
                                placeholder="Enter username"
                            />
                        </div>

                        {/* Password */}
                        <div className="flex flex-col gap-2">
                            <label htmlFor="login-password" className="text-gray-700 text-sm font-medium">
                                Password
                            </label>

                            <div className="relative">
                                <input
                                    id="login-password"
                                    name="password"
                                    autoComplete="current-password"
                                    type={showPassword ? "text" : "password"}
                                    className="w-full h-12 bg-white text-gray-900 placeholder-gray-400
                                    border border-gray-300 rounded-md px-4 pr-16
                                    outline-none focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-indigo-300 transition-colors"
                                    value={form.password}
                                    onChange={(e) =>
                                        setForm({ ...form, password: e.target.value })
                                    }
                                    placeholder="Enter password"
                                />

                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-3 my-auto h-8 px-2 rounded-md flex items-center text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                                >
                                    {showPassword ? "Hide" : "Show"}
                                </button>
                            </div>
                        </div>

                        {/* Button */}
                        <button
                            onClick={handleLogin}
                            type="button"
                            className="w-full h-12 bg-indigo-600 hover:bg-indigo-700
                            active:translate-y-px
                            text-white text-base font-medium
                            rounded-lg shadow-md hover:shadow-lg
                            transition-[background-color,box-shadow,transform] duration-200"
                        >
                            Login
                        </button>

                        <Link
                            to="/balance"
                            className="block text-center text-sm text-gray-600 underline underline-offset-4 decoration-gray-300 hover:text-gray-900 hover:decoration-red-500 transition-colors"
                        >
                            Check your store credit or gift card balance
                        </Link>
                    </div>
                </div>
            </div>

            {/* Animation */}
            <style>
                {`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .animate-fadeIn {
                    animation: fadeIn 0.7s ease-out forwards;
                }
                `}
            </style>
        </div>
    );
};

export default LoginPage;
