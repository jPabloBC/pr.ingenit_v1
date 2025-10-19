'use client'

import React, { useState, useEffect, useRef } from 'react'
import { TextField, Box, Typography } from '@mui/material'
import { colors } from '@/theme/theme'

interface CountryPhoneInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  defaultCountry?: string
}

// Lista de países con códigos
const countries = [
  { value: 'CL', label: 'Chile', dialCode: '+56' },
  { value: 'AR', label: 'Argentina', dialCode: '+54' },
  { value: 'BR', label: 'Brasil', dialCode: '+55' },
  { value: 'CO', label: 'Colombia', dialCode: '+57' },
  { value: 'PE', label: 'Perú', dialCode: '+51' },
  { value: 'VE', label: 'Venezuela', dialCode: '+58' },
  { value: 'EC', label: 'Ecuador', dialCode: '+593' },
  { value: 'BO', label: 'Bolivia', dialCode: '+591' },
  { value: 'UY', label: 'Uruguay', dialCode: '+598' },
  { value: 'PY', label: 'Paraguay', dialCode: '+595' },
  { value: 'MX', label: 'México', dialCode: '+52' },
  { value: 'US', label: 'Estados Unidos', dialCode: '+1' },
  { value: 'CA', label: 'Canadá', dialCode: '+1' },
  { value: 'ES', label: 'España', dialCode: '+34' },
  { value: 'DE', label: 'Alemania', dialCode: '+49' },
  { value: 'FR', label: 'Francia', dialCode: '+33' },
  { value: 'GB', label: 'Reino Unido', dialCode: '+44' },
  { value: 'IT', label: 'Italia', dialCode: '+39' },
  { value: 'NL', label: 'Países Bajos', dialCode: '+31' },
  { value: 'BE', label: 'Bélgica', dialCode: '+32' },
  { value: 'CH', label: 'Suiza', dialCode: '+41' },
  { value: 'AT', label: 'Austria', dialCode: '+43' },
  { value: 'SE', label: 'Suecia', dialCode: '+46' },
  { value: 'NO', label: 'Noruega', dialCode: '+47' },
  { value: 'DK', label: 'Dinamarca', dialCode: '+45' },
  { value: 'FI', label: 'Finlandia', dialCode: '+358' },
  { value: 'PL', label: 'Polonia', dialCode: '+48' },
  { value: 'CZ', label: 'República Checa', dialCode: '+420' },
  { value: 'HU', label: 'Hungría', dialCode: '+36' },
  { value: 'RO', label: 'Rumania', dialCode: '+40' },
  { value: 'BG', label: 'Bulgaria', dialCode: '+359' },
  { value: 'HR', label: 'Croacia', dialCode: '+385' },
  { value: 'SI', label: 'Eslovenia', dialCode: '+386' },
  { value: 'SK', label: 'Eslovaquia', dialCode: '+421' },
  { value: 'LT', label: 'Lituania', dialCode: '+370' },
  { value: 'LV', label: 'Letonia', dialCode: '+371' },
  { value: 'EE', label: 'Estonia', dialCode: '+372' },
  { value: 'IE', label: 'Irlanda', dialCode: '+353' },
  { value: 'PT', label: 'Portugal', dialCode: '+351' },
  { value: 'GR', label: 'Grecia', dialCode: '+30' },
  { value: 'CY', label: 'Chipre', dialCode: '+357' },
  { value: 'MT', label: 'Malta', dialCode: '+356' },
  { value: 'LU', label: 'Luxemburgo', dialCode: '+352' },
  { value: 'IS', label: 'Islandia', dialCode: '+354' },
  { value: 'LI', label: 'Liechtenstein', dialCode: '+423' },
  { value: 'MC', label: 'Mónaco', dialCode: '+377' },
  { value: 'SM', label: 'San Marino', dialCode: '+378' },
  { value: 'VA', label: 'Ciudad del Vaticano', dialCode: '+379' },
  { value: 'AD', label: 'Andorra', dialCode: '+376' },
  { value: 'BY', label: 'Bielorrusia', dialCode: '+375' },
  { value: 'UA', label: 'Ucrania', dialCode: '+380' },
  { value: 'RU', label: 'Rusia', dialCode: '+7' },
  { value: 'AL', label: 'Albania', dialCode: '+355' },
  { value: 'BA', label: 'Bosnia y Herzegovina', dialCode: '+387' },
  { value: 'RS', label: 'Serbia', dialCode: '+381' },
  { value: 'ME', label: 'Montenegro', dialCode: '+382' },
  { value: 'MK', label: 'Macedonia del Norte', dialCode: '+389' },
  { value: 'XK', label: 'Kosovo', dialCode: '+383' },
  { value: 'CN', label: 'China', dialCode: '+86' },
  { value: 'JP', label: 'Japón', dialCode: '+81' },
  { value: 'KR', label: 'Corea del Sur', dialCode: '+82' },
  { value: 'KP', label: 'Corea del Norte', dialCode: '+850' },
  { value: 'IN', label: 'India', dialCode: '+91' },
  { value: 'PK', label: 'Pakistán', dialCode: '+92' },
  { value: 'BD', label: 'Bangladesh', dialCode: '+880' },
  { value: 'LK', label: 'Sri Lanka', dialCode: '+94' },
  { value: 'MV', label: 'Maldivas', dialCode: '+960' },
  { value: 'NP', label: 'Nepal', dialCode: '+977' },
  { value: 'BT', label: 'Bután', dialCode: '+975' },
  { value: 'AF', label: 'Afganistán', dialCode: '+93' },
  { value: 'TH', label: 'Tailandia', dialCode: '+66' },
  { value: 'SG', label: 'Singapur', dialCode: '+65' },
  { value: 'MY', label: 'Malasia', dialCode: '+60' },
  { value: 'ID', label: 'Indonesia', dialCode: '+62' },
  { value: 'PH', label: 'Filipinas', dialCode: '+63' },
  { value: 'VN', label: 'Vietnam', dialCode: '+84' },
  { value: 'MM', label: 'Myanmar', dialCode: '+95' },
  { value: 'KH', label: 'Camboya', dialCode: '+855' },
  { value: 'LA', label: 'Laos', dialCode: '+856' },
  { value: 'BN', label: 'Brunei', dialCode: '+673' },
  { value: 'TL', label: 'Timor Oriental', dialCode: '+670' },
  { value: 'TW', label: 'Taiwán', dialCode: '+886' },
  { value: 'HK', label: 'Hong Kong', dialCode: '+852' },
  { value: 'MO', label: 'Macao', dialCode: '+853' },
  { value: 'MN', label: 'Mongolia', dialCode: '+976' },
  { value: 'KZ', label: 'Kazajistán', dialCode: '+7' },
  { value: 'UZ', label: 'Uzbekistán', dialCode: '+998' },
  { value: 'KG', label: 'Kirguistán', dialCode: '+996' },
  { value: 'TJ', label: 'Tayikistán', dialCode: '+992' },
  { value: 'TM', label: 'Turkmenistán', dialCode: '+993' },
  { value: 'IR', label: 'Irán', dialCode: '+98' },
  { value: 'IQ', label: 'Irak', dialCode: '+964' },
  { value: 'SY', label: 'Siria', dialCode: '+963' },
  { value: 'LB', label: 'Líbano', dialCode: '+961' },
  { value: 'JO', label: 'Jordania', dialCode: '+962' },
  { value: 'IL', label: 'Israel', dialCode: '+972' },
  { value: 'PS', label: 'Palestina', dialCode: '+970' },
  { value: 'TR', label: 'Turquía', dialCode: '+90' },
  { value: 'SA', label: 'Arabia Saudí', dialCode: '+966' },
  { value: 'AE', label: 'Emiratos Árabes Unidos', dialCode: '+971' },
  { value: 'QA', label: 'Catar', dialCode: '+974' },
  { value: 'BH', label: 'Baréin', dialCode: '+973' },
  { value: 'KW', label: 'Kuwait', dialCode: '+965' },
  { value: 'OM', label: 'Omán', dialCode: '+968' },
  { value: 'YE', label: 'Yemen', dialCode: '+967' },
  { value: 'ZA', label: 'Sudáfrica', dialCode: '+27' },
  { value: 'NG', label: 'Nigeria', dialCode: '+234' },
  { value: 'EG', label: 'Egipto', dialCode: '+20' },
  { value: 'KE', label: 'Kenia', dialCode: '+254' },
  { value: 'TZ', label: 'Tanzania', dialCode: '+255' },
  { value: 'UG', label: 'Uganda', dialCode: '+256' },
  { value: 'ET', label: 'Etiopía', dialCode: '+251' },
  { value: 'GH', label: 'Ghana', dialCode: '+233' },
  { value: 'CI', label: 'Costa de Marfil', dialCode: '+225' },
  { value: 'SN', label: 'Senegal', dialCode: '+221' },
  { value: 'ML', label: 'Mali', dialCode: '+223' },
  { value: 'BF', label: 'Burkina Faso', dialCode: '+226' },
  { value: 'NE', label: 'Níger', dialCode: '+227' },
  { value: 'TD', label: 'Chad', dialCode: '+235' },
  { value: 'CM', label: 'Camerún', dialCode: '+237' },
  { value: 'CF', label: 'República Centroafricana', dialCode: '+236' },
  { value: 'GQ', label: 'Guinea Ecuatorial', dialCode: '+240' },
  { value: 'GA', label: 'Gabón', dialCode: '+241' },
  { value: 'CG', label: 'República del Congo', dialCode: '+242' },
  { value: 'CD', label: 'República Democrática del Congo', dialCode: '+243' },
  { value: 'AO', label: 'Angola', dialCode: '+244' },
  { value: 'ZM', label: 'Zambia', dialCode: '+260' },
  { value: 'ZW', label: 'Zimbabue', dialCode: '+263' },
  { value: 'BW', label: 'Botswana', dialCode: '+267' },
  { value: 'NA', label: 'Namibia', dialCode: '+264' },
  { value: 'SZ', label: 'Eswatini', dialCode: '+268' },
  { value: 'LS', label: 'Lesoto', dialCode: '+266' },
  { value: 'MG', label: 'Madagascar', dialCode: '+261' },
  { value: 'MU', label: 'Mauricio', dialCode: '+230' },
  { value: 'SC', label: 'Seychelles', dialCode: '+248' },
  { value: 'KM', label: 'Comoras', dialCode: '+269' },
  { value: 'DJ', label: 'Yibuti', dialCode: '+253' },
  { value: 'SO', label: 'Somalia', dialCode: '+252' },
  { value: 'ER', label: 'Eritrea', dialCode: '+291' },
  { value: 'SD', label: 'Sudán', dialCode: '+249' },
  { value: 'SS', label: 'Sudán del Sur', dialCode: '+211' },
  { value: 'LY', label: 'Libia', dialCode: '+218' },
  { value: 'TN', label: 'Túnez', dialCode: '+216' },
  { value: 'DZ', label: 'Argelia', dialCode: '+213' },
  { value: 'MA', label: 'Marruecos', dialCode: '+212' },
  { value: 'EH', label: 'Sáhara Occidental', dialCode: '+212' },
  { value: 'MR', label: 'Mauritania', dialCode: '+222' },
  { value: 'GN', label: 'Guinea', dialCode: '+224' },
  { value: 'GW', label: 'Guinea-Bisáu', dialCode: '+245' },
  { value: 'CV', label: 'Cabo Verde', dialCode: '+238' },
  { value: 'ST', label: 'Santo Tomé y Príncipe', dialCode: '+239' },
  { value: 'LR', label: 'Liberia', dialCode: '+231' },
  { value: 'SL', label: 'Sierra Leona', dialCode: '+232' },
  { value: 'GM', label: 'Gambia', dialCode: '+220' },
  { value: 'RW', label: 'Ruanda', dialCode: '+250' },
  { value: 'BI', label: 'Burundi', dialCode: '+257' },
  { value: 'AU', label: 'Australia', dialCode: '+61' },
  { value: 'NZ', label: 'Nueva Zelanda', dialCode: '+64' },
  { value: 'FJ', label: 'Fiji', dialCode: '+679' },
  { value: 'PG', label: 'Papúa Nueva Guinea', dialCode: '+675' },
  { value: 'SB', label: 'Islas Salomón', dialCode: '+677' },
  { value: 'VU', label: 'Vanuatu', dialCode: '+678' },
  { value: 'NC', label: 'Nueva Caledonia', dialCode: '+687' },
  { value: 'PF', label: 'Polinesia Francesa', dialCode: '+689' },
  { value: 'WS', label: 'Samoa', dialCode: '+685' },
  { value: 'TO', label: 'Tonga', dialCode: '+676' },
  { value: 'KI', label: 'Kiribati', dialCode: '+686' },
  { value: 'TV', label: 'Tuvalu', dialCode: '+688' },
  { value: 'NR', label: 'Nauru', dialCode: '+674' },
  { value: 'FM', label: 'Micronesia', dialCode: '+691' },
  { value: 'MH', label: 'Islas Marshall', dialCode: '+692' },
  { value: 'PW', label: 'Palau', dialCode: '+680' },
  { value: 'AS', label: 'Samoa Americana', dialCode: '+1' },
  { value: 'GU', label: 'Guam', dialCode: '+1' },
  { value: 'MP', label: 'Islas Marianas del Norte', dialCode: '+1' },
  { value: 'VI', label: 'Islas Vírgenes de EE.UU.', dialCode: '+1' },
  { value: 'PR', label: 'Puerto Rico', dialCode: '+1' },
  { value: 'CK', label: 'Islas Cook', dialCode: '+682' },
  { value: 'NU', label: 'Niue', dialCode: '+683' },
  { value: 'TK', label: 'Tokelau', dialCode: '+690' },
]

const CountryPhoneInput: React.FC<CountryPhoneInputProps> = ({
  value,
  onChange,
  placeholder = "Ingresa el número de teléfono",
  defaultCountry = "CL"
}) => {
  const [selectedCountry, setSelectedCountry] = useState(
    countries.find(c => c.value === defaultCountry) || countries[0]
  )
  const [phoneNumber, setPhoneNumber] = useState('')

  // Sincronizar el valor externo con el estado interno
  useEffect(() => {
    if (value && value !== phoneNumber) {
      // Si el valor contiene un código de país, extraer solo el número
      const countryCodes = countries.map(c => c.dialCode).sort((a, b) => b.length - a.length)
      let number = value
      let country = defaultCountry
      
      for (const code of countryCodes) {
        if (value.startsWith(code)) {
          number = value.substring(code.length)
          const foundCountry = countries.find(c => c.dialCode === code)
          if (foundCountry) {
            country = foundCountry.value
            setSelectedCountry(foundCountry)
          }
          break
        }
      }
      
      setPhoneNumber(number)
    }
  }, [value, defaultCountry])
  const [searchTerm, setSearchTerm] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isOpen) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setHighlightedIndex(prev => Math.min(prev + 1, filteredCountries.length - 1))
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          setHighlightedIndex(prev => Math.max(prev - 1, 0))
        } else if (event.key === 'Enter') {
          event.preventDefault()
          if (filteredCountries[highlightedIndex]) {
            handleCountryChange(filteredCountries[highlightedIndex])
          }
        } else if (event.key === 'Escape') {
          setIsOpen(false)
        } else if (event.key.length === 1) { // Solo caracteres alfanuméricos
          setSearchTerm(prev => prev + event.key)
        } else if (event.key === 'Backspace') {
          setSearchTerm(prev => prev.slice(0, -1))
        }
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const handleCountryChange = (newValue: any) => {
    if (newValue && newValue.dialCode) {
      setSelectedCountry(newValue)
      const fullPhone = newValue.dialCode + phoneNumber
      onChange(fullPhone)
      setIsOpen(false)
    }
  }

  const filteredCountries = countries.filter(country =>
    country.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    country.dialCode.includes(searchTerm) ||
    country.value.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Resetear índice destacado cuando cambia el término de búsqueda
  useEffect(() => {
    setHighlightedIndex(0)
  }, [searchTerm])

  const handlePhoneChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const number = event.target.value.replace(/[^0-9]/g, '')
    setPhoneNumber(number)
    if (selectedCountry && selectedCountry.dialCode) {
      const fullPhone = selectedCountry.dialCode + number
      onChange(fullPhone)
    }
  }

  const customStyles = {
    control: (provided: any, state: any) => ({
      ...provided,
      minHeight: '40px',
      width: '60px',
      border: `1px solid ${colors.gray4}`,
      borderRadius: '4px',
      boxShadow: 'none',
      '&:hover': {
        borderColor: colors.blue6,
      },
      ...(state.isFocused && {
        borderColor: colors.blue6,
        boxShadow: `0 0 0 1px ${colors.blue6}`,
      }),
    }),
    option: (provided: any, state: any) => ({
      ...provided,
      backgroundColor: state.isSelected 
        ? colors.blue6 
        : state.isFocused 
          ? colors.blue1 
          : 'white',
      color: state.isSelected ? 'white' : colors.gray8,
      padding: '12px 16px',
      minHeight: '50px',
      '&:hover': {
        backgroundColor: state.isSelected ? colors.blue6 : colors.blue1,
      },
    }),
    menu: (provided: any) => ({
      ...provided,
      zIndex: 1000,
      maxHeight: '400px',
      minWidth: '250px',
    }),
    menuList: (provided: any) => ({
      ...provided,
      maxHeight: '400px',
    }),
    input: (provided: any) => ({
      ...provided,
      color: colors.gray8,
      fontSize: '14px',
    }),
    placeholder: (provided: any) => ({
      ...provided,
      color: colors.gray6,
      fontSize: '14px',
    }),
  }

  const formatOptionLabel = (option: any) => (
    <Box display="flex" alignItems="center" gap={2} width="100%">
      <Box 
        component="img" 
        src={`https://flagcdn.com/w40/${option.value?.toLowerCase() || 'cl'}.png`}
        srcSet={`https://flagcdn.com/w40/${option.value?.toLowerCase() || 'cl'}.png 2x`}
        alt={option.label || 'País'}
        sx={{ width: 24, height: 18, objectFit: 'cover' }}
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
      />
      <Typography sx={{ fontSize: '16px', fontWeight: 500, flex: 1 }}>{option.label || 'País'}</Typography>
      <Typography sx={{ fontSize: '14px', color: colors.gray6, minWidth: '60px' }}>{option.dialCode || '+56'}</Typography>
    </Box>
  )

  const formatValueLabel = (option: any) => (
    <Box display="flex" alignItems="center" justifyContent="center">
      <Box 
        component="img" 
        src={`https://flagcdn.com/w40/${option.value?.toLowerCase() || 'cl'}.png`}
        srcSet={`https://flagcdn.com/w40/${option.value?.toLowerCase() || 'cl'}.png 2x`}
        alt={option.label || 'País'}
        sx={{ width: 24, height: 18, objectFit: 'cover' }}
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
      />
    </Box>
  )

  return (
    <Box display="flex" gap={1} alignItems="center">
      {/* Selector de país con banderas */}
      <Box ref={dropdownRef} sx={{ minWidth: 60, width: 60, position: 'relative' }}>
        {/* Campo cerrado - solo bandera */}
        <Box
          onClick={() => setIsOpen(!isOpen)}
          sx={{
            width: '100%',
            height: '40px',
            border: `1px solid ${colors.gray4}`,
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            '&:hover': {
              borderColor: colors.blue6,
            },
            ...(isOpen && {
              borderColor: colors.blue6,
              boxShadow: `0 0 0 1px ${colors.blue6}`,
            }),
          }}
        >
          <Box 
            component="img" 
            src={`https://flagcdn.com/w40/${selectedCountry.value?.toLowerCase() || 'cl'}.png`}
            srcSet={`https://flagcdn.com/w40/${selectedCountry.value?.toLowerCase() || 'cl'}.png 2x`}
            alt={selectedCountry.label || 'País'}
            sx={{ width: 24, height: 18, objectFit: 'cover' }}
            onError={(e) => {
              e.currentTarget.style.display = 'none'
            }}
          />
        </Box>

        {/* Dropdown con búsqueda */}
        {isOpen && (
          <Box
            sx={{
              position: 'absolute',
              top: '100%',
              left: 0,
              width: '300px',
              zIndex: 1000,
              backgroundColor: 'white',
              border: `1px solid ${colors.gray4}`,
              borderRadius: '4px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              maxHeight: '400px',
              overflow: 'hidden',
            }}
          >
            {/* Campo de búsqueda */}
            <Box sx={{ p: 2, borderBottom: `1px solid ${colors.gray2}` }}>
              <TextField
                fullWidth
                size="small"
                placeholder="Buscar país..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    '& fieldset': {
                      borderColor: colors.gray4,
                    },
                    '&:hover fieldset': {
                      borderColor: colors.blue6,
                    },
                    '&.Mui-focused fieldset': {
                      borderColor: colors.blue6,
                    },
                  },
                }}
              />
            </Box>

            {/* Lista de países */}
            <Box sx={{ maxHeight: '300px', overflowY: 'auto' }}>
              {filteredCountries.map((country, index) => (
                <Box
                  key={country.value}
                  onClick={() => handleCountryChange(country)}
                  sx={{
                    p: 2,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    '&:hover': {
                      backgroundColor: colors.blue1,
                    },
                    ...(selectedCountry.value === country.value && {
                      backgroundColor: colors.blue6,
                      color: 'white',
                    }),
                    ...(index === highlightedIndex && {
                      backgroundColor: colors.blue1,
                    }),
                  }}
                >
                  <Box 
                    component="img" 
                    src={`https://flagcdn.com/w40/${country.value?.toLowerCase() || 'cl'}.png`}
                    srcSet={`https://flagcdn.com/w40/${country.value?.toLowerCase() || 'cl'}.png 2x`}
                    alt={country.label || 'País'}
                    sx={{ width: 24, height: 18, objectFit: 'cover' }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                  <Typography sx={{ fontSize: '16px', fontWeight: 500, flex: 1 }}>
                    {country.label}
                  </Typography>
                  <Typography sx={{ fontSize: '14px', color: colors.gray6 }}>
                    {country.dialCode}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        )}
      </Box>

      {/* Campo de teléfono */}
      <TextField
        fullWidth
        variant="outlined"
        size="small"
        placeholder={placeholder}
        value={phoneNumber}
        onChange={handlePhoneChange}
        InputProps={{
          startAdornment: (
            <Box 
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 0.5, 
                px: 1, 
                color: '#000000',
                fontSize: '16px',
                fontWeight: 400
              }}
            >
              {selectedCountry.dialCode}
            </Box>
          ),
        }}
        sx={{
          '& .MuiOutlinedInput-root': {
            '& fieldset': {
              borderColor: colors.gray4,
            },
            '&:hover fieldset': {
              borderColor: colors.blue6,
            },
            '&.Mui-focused fieldset': {
              borderColor: colors.blue6,
            },
          },
        }}
      />
    </Box>
  )
}

export default CountryPhoneInput
