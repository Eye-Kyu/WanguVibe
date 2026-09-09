import { useState, useContext } from "react";
import api from "../api/axiosInstance";
import { AuthContext } from "../context/AuthContext.jsx";
import { useNavigate } from "react-router-dom";
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
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

            {/* Center Wrapper */}
            <div className="relative z-10 flex items-center justify-center w-full h-full px-4">

                {/* Card */}
                <div className="w-full rounded-xl max-w-md 
                    bg-red/10 backdrop-blur-2xl
                    border border-white/20 shadow-2xl
                    p-6 sm:p-8 md:p-10
                    animate-fadeIn">

                    {/* Logo */}
                    <div className="flex justify-center mb-5">
                        <img
                            src={businessSettings.logoPath}
                            alt={`${businessSettings.name} logo`}
                            className="w-20 sm:w-24 md:w-28 h-auto"
                        />
                    </div>

                    {/* Title */}
                    <div className="text-center mb-6">
                        <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold tracking-widest
                            bg-gradient-to-r from-purple-300 via-purple-500 to-purple-600
                            bg-clip-text text-transparent">
                            {businessSettings.name}
                        </h1>
                        <p className="text-gray-200 text-xs sm:text-sm mt-2">
                            Welcome back
                        </p>
                    </div>

                    <div className="space-y-5">

                        {/* Username */}
                        <div className="flex flex-col gap-2">
                            <label className="text-gray-200 text-xs sm:text-sm">
                                Username
                            </label>
                            <input
                                className="w-full bg-white/20 text-white placeholder-gray-300
                                rounded-full px-4 sm:px-5 py-2.5
                                outline-none focus:ring-2 focus:ring-yellow-400 transition"
                                value={form.username}
                                onChange={(e) =>
                                    setForm({ ...form, username: e.target.value })
                                }
                                placeholder="Enter username"
                            />
                        </div>

                        {/* Password */}
                        <div className="flex flex-col gap-2">
                            <label className="text-gray-200 text-xs sm:text-sm">
                                Password
                            </label>

                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    className="w-full bg-white/20 text-white placeholder-gray-300
                                    rounded-full px-4 sm:px-5 py-2.5 pr-14
                                    outline-none focus:ring-2 focus:ring-yellow-400 transition"
                                    value={form.password}
                                    onChange={(e) =>
                                        setForm({ ...form, password: e.target.value })
                                    }
                                    placeholder="Enter password"
                                />

                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute inset-y-0 right-4 flex items-center text-xs sm:text-sm text-black-300 hover:text-yellow-400 transition"
                                >
                                    {showPassword ? "Hide" : "Show"}
                                </button>
                            </div>
                        </div>

                        {/* Button */}
                        <button
                            onClick={handleLogin}
                            className="w-full bg-gradient-to-r
                            from-purple-500 to-purple-600
                            hover:from-yellow-600 hover:to-yellow-700
                            active:scale-95
                            text-white text-sm sm:text-base font-semibold
                            py-2.5 rounded-full
                            transition duration-300 shadow-lg"
                        >
                            Login
                        </button>
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
