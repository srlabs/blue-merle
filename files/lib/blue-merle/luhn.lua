---- Adapted from https://cybersecurity.att.com/blogs/labs-research/luhn-checksum-algorithm-lua-implementation

local bit = require("bit")

local band, bor, bxor = bit.band, bit.bor, bit.bxor

function luhn_checksum(card)
    local num = 0
    local nDigits = card:len()
	odd = band(nDigits, 1)

	for count = 0,nDigits-1 do

		digit = tonumber(string.sub(card, count+1,count+1))

		if (bxor(band(count, 1),odd)) == 0
		then
		        digit = digit * 2
        end

        if digit > 9 then
                digit = digit - 9
        end

        num = num + digit
    end

	return num
end

function luhn_digit (s)
	local num = luhn_checksum (s)
    return (10 - (num % 10))
end

function is_valid_luhn (s)
	local num = luhn_checksum (s)
    return ((num % 10) == 0)
end


function make_imei (premei)
	local imei = premei .. tostring(luhn_digit(premei .. "0"))
	return imei
end

function make_random_imei ()
    local nDigits = 14
    local premei = ""
	for count = 0, nDigits-1 do
	    premei = premei .. tostring (math.random (0, 9))
	end

	local imei = make_imei (tostring (premei))

	return imei
end

math.randomseed(tonumber(arg[1]))

print (make_random_imei ())
